import { Injectable } from '@nestjs/common';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import {config} from '../config';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {RecursiveCharacterTextSplitter} from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents'
// 内存向量库
// import {MemoryVectorStore} from '@langchain/classic/vectorstores/memory';
// 真实向量库
import {PGVectorStore, DistanceStrategy} from '@langchain/community/vectorstores/pgvector';
import {Pool} from 'pg';

@Injectable()
export class RagDbService {
    // 聊天模型
    private llm = new ChatOllama({
        model: config.ollama.chatModel,
        baseUrl: config.ollama.host,
        temperature: 0.1,//RAG场景下要低温度，生成回答更稳定，避免随机性
        // numCtx：上下文窗口大小，单位是token，越小越省内存。对应ollama ps命令的CONTEXT列参数
        // 一次对话中，system prompt + 历史消息 + 你的问题 + 模型生成的回答，全部加起来不能超过这个数
        // numCtx: 8192,
    });

    // 向量化模型：把文本转成数字向量，用于相似度计算
    private embeddings = new OllamaEmbeddings({
        model: config.ollama.embedModel,
        baseUrl: config.ollama.host,
    });

    // 创建postgreSQL连接池
    private pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,//最大连接数
        idleTimeoutMillis: 30000,//空闲连接超时时间，单位毫秒
        connectionTimeoutMillis: 2000,//连接超时时间，单位毫秒
    });

    // PGVectorStore配置
    // ✅ 关键：pgVectorConfig 里传 pool 而不是 postgresConnectionOptions
    // 传 pool → PGVectorStore 直接用这个池，不会自己创建新池，end() 就无效了
    // 传 postgresConnectionOptions → PGVectorStore 自己创建新池，end() 会销毁它
    private pgVectorStoreConfig = {
      pool: this.pool,//pg连接池
      collectionName: 'rag-knowledge-base',//存储向量的集合名称
      collectionTableName: 'langchain_pg_collection',//存储文档的表名
      tableName: 'langchain_pg_embedding',//向量表名
      columns: {
        idColumnName: 'id',//id列名
        vectorColumnName: 'embedding',//向量列名
        contentColumnName: 'document',//文档内容列名
        metadataColumnName: 'cmetadata',//元数据列名(用于存储文档的来源、文档id等信息)
      },
      distanceStrategy: 'cosine' as DistanceStrategy,//余弦相似度作为距离计算指标，越大越相似，越小越不相似
    }

    private docCount = 0

    // 加载文档到向量库
    async loadDocuments(documents: {id:string; content:string; source?:string}[]){
        //文本拆分器
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 500,//每个分块的字符数
            chunkOverlap: 50,// 相邻分块之间的重叠字符数
            separators: [// 分隔符，用于将文本分割成分块，优先级为从上到下依次尝试
                '\n\n', //第一优先：段落分隔
                '\n', //第二优先：分行
                '。', //第三优先：句号
                '！','？',
                ' ', //第四优先：空格
                '' //最后
            ],
        })
        const allDocs: Document[] = [];// 所有文档的分块（如按照上述embedding模型，按照chunkSize个字符分割的块）
        for(const doc of documents){
            // createDocuments(texts, metadatas)：将文本分割成分块，同时添加元数据
            const chunks = await splitter.createDocuments(
                [doc.content],
                [{source:doc.source||doc.id, id: doc.id}]
            );
            allDocs.push(...chunks);
        }

        // pgvectorstore 存入pgvector数据库
        // pgvectorstore.fromDocuments(documents, embeddings, config) 内部会调用this.embeddings.embedDocuments把文本转成向量
        // 1.首次调用 自动创建表结构(langchain_pg_collection 存储文档，langchain_pg_embedding 存储向量)
        // 2.后续调用 自动把向量数据插入 langchain_pg_embedding 表，文档数据插入 langchain_pg_collection 表
        const vectorStore = await PGVectorStore.fromDocuments(
            allDocs, 
            this.embeddings, 
            this.pgVectorStoreConfig
        );
        this.docCount += documents.length;

        return {
            success:true,
            originalDocs:documents.length,
            totalChunk:allDocs.length,
            message:`加载${documents.length}篇文档，共${allDocs.length}个分块`
        }
    }
    // 获取当前状态
    async getStatus(){
        try{
            const results = await this.pool.query(`SELECT COUNT(*) FROM ${this.pgVectorStoreConfig.tableName}
                where collection_id = (SELECT uuid from ${this.pgVectorStoreConfig.collectionTableName} where name=$1)`,
                [this.pgVectorStoreConfig.collectionName]);
            const vectorCount=parseInt(results.rows[0].count, 10);
            return {
                mode:'pgvector',
                loaded: vectorCount>0,
                collection: this.pgVectorStoreConfig.collectionName,
                message: vectorCount>0?'postgreSQL向量数据库已加载 '+vectorCount+' 个向量块':'状态获取成功，但知识库为空'
            }
        }catch(err){
            console.error('获取状态失败:',err);
            return {
                mode:'pgvector',
                loaded: false,
                vectorCount: 0,
                message:'获取状态失败，可能是数据库连接问题，请先调用/rag-db/load加载文档到向量库'
            }
        }
    }
    // 纯向量查询（不通过大模型，直接根据向量相似度计算）
    async search(query: string, topK: number = 3){
        // similaritySearchWithScore
        // 1.把query向量化（调用embedding.embedQuery）
        // 2.将向量化的query与所有文档的向量进行余弦相似度计算
        // 3.按照相似度排序，返回前topK个数据
        const pgvectorStore = await PGVectorStore.initialize(
            this.embeddings,
            this.pgVectorStoreConfig
        );
        const results = await pgvectorStore.similaritySearchWithScore(query, topK);
        return {
            query,
            results: results.map(([doc, score])=>({
                content: doc.pageContent,
                source: doc.metadata.source,
                // 注意不要和内存向量库搞混，这里返回的score是余弦距离，不是相似度
                rawDistance: parseFloat(score.toFixed(4)),//余弦距离，越小越相似
                similarity: 1 - parseFloat(score.toFixed(4)),//余弦相似度，越大越相似
            }))
        }
    }

    // 完整的rag回答，调用大模型
    async query(question: string, topK: number = 3){
        const pgvectorStore = await PGVectorStore.initialize(
            this.embeddings,
            this.pgVectorStoreConfig
        );
        // step1:检索相关文档块
        const retrieved = await pgvectorStore.similaritySearchWithScore(question, topK);
        // 这里score是余弦距离，越小越相似，范围是0-1，这里先筛选出相似度大于等于0.5的文档块
        const filtered = retrieved.filter(([doc,score])=>score<=0.5);
        if(!filtered.length ){
            return {
                question,
                answer:'知识库中没有找到相关内容',
                sources:[]
            }
        }
        // step2:把检索结果拼成context字符串
        // [1] 第一块内容...\n\n[2] 第二块内容...\n\n[3] 第三块内容...
        // 编号方便模型在回答时引用："根据[1]..."
        const context = filtered.map(([doc],index)=>`[${index+1}] ${doc.pageContent}`).join('\n\n');
        // step3:RAG prompt，严格限制大模型只能根据参考资料回答
        const prompt = ChatPromptTemplate.fromMessages([
            ['system',
                `你是一个知识库问答助手，严格基于参考资料回答问题。
                规则：
                1. 只根据参考资料内容回答，不能使用资料外的知识
                2. 资料中没有相关信息，回答"知识库中暂无相关内容"
                3. 回答简洁准确，使用中文
                参考资料：
                {context}
                `],
            ['human', '{question}']
        ]);
        // step4:调用大模型生成回答
        const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
        const answer = await chain.invoke(
            {context, question},
            { timeout: 120000 },   // 120 秒，单位毫秒
        );
        return {
            question,
            answer,
            sources: retrieved.map(([doc,score])=>({
                content: doc.pageContent,
                source: doc.metadata.source,
                score: parseFloat(score.toFixed(4)),//余弦距离，越小越相似
                similarity: 1 - parseFloat(score.toFixed(4)),//余弦相似度，越大越相似
            }))
        }
    }

    // 清空知识库
    async clearKnowledge(){
        // 清空向量库
        await this.pool.query(`
            DELETE FROM langchain_pg_embeddings
            WHERE connection_id=(
                SELECT uuid FROM langchain_pg_connection
                WHERE name=$1
            )`,[this.pgVectorStoreConfig.collectionName])
        // 清空文档库
        await this.pool.query(`
            DELETE FROM langchain_pg_collection
            WHERE name=$1
            )`,[this.pgVectorStoreConfig.collectionName])
        this.docCount = 0
        return { 
            success: true, 
            message: `已清空 collection：${this.pgVectorStoreConfig.collectionName}` 
        }
    }

    // nestjs模块销毁时，关闭数据库连接池
    async onModuleDestroy(){
        await this.pool.end();
        console.log('数据库连接池已关闭');
    }
}

/*
PGVectorStore 返回距离（越小越像），MemoryVectorStore 返回相似度（越大越像），大模型从头到尾不参与打分。

`similaritySearchWithScore` 返回的是 `[Document, 分块分值][]` ，
按“最相关”排在最前。这个分值代表什么，由 向量库的实现和配置 决定，和“有没有调用大模型”完全无关。

const results = await pgvectorStore.similaritySearchWithScore(query, topK);
// results类型为: [
//   [Document { pageContent: "分块原文...", metadata: { source, id } }, 0.1863],
//   [Document { pageContent: "...",        metadata: {...} },          0.2917],
// ]
*/