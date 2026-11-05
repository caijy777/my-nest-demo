import { Injectable } from '@nestjs/common';
import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama';
import {config} from '../config';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {RecursiveCharacterTextSplitter} from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents'
import {MemoryVectorStore} from '@langchain/classic/vectorstores/memory';

@Injectable()
export class RagService {
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

    // 内存向量库（null 表示未初始化）
    private vectorStore: MemoryVectorStore | null = null
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
        const allDocs: Document[] = [];// 所有文档的分块
        for(const doc of documents){
            // createDocuments(texts, metadatas)：将文本分割成分块，同时添加元数据
            const chunks = await splitter.createDocuments(
                [doc.content],
                [{source:doc.source||doc.id, id: doc.id}]
            );
            allDocs.push(...chunks);
        }

        // 内部调用MemoryVectorStore转成向量
        // fromDocuments(documents, embeddings)：批量向量化所有文档块，存入内存向量库
        this.vectorStore = await MemoryVectorStore.fromDocuments(allDocs, this.embeddings);
        this.docCount = documents.length;

        return {
            success:true,
            originalDocs:documents.length,
            totalChunk:allDocs.length,
            message:`加载${documents.length}篇文档，共${allDocs.length}个分块`
        }
    }
    // 获取当前状态
    getStatus(){
        return {
            loaded: !!this.vectorStore,
            docCount:this.docCount,
            message:this.vectorStore?`加载${this.docCount}篇文档`:'知识库是空的，请先加载文档'
        }
    }
    // 纯向量查询（不通过大模型，直接根据向量相似度计算）
    async search(query: string, topK: number = 3){
        if(!this.vectorStore){
            return {
                success:false,
                message:'知识库未加载，请先加载文档'
            }
        }
        // similaritySearchWithScore
        // 1.把query向量化（调用embedding.embedQuery）
        // 2.将向量化的query与所有文档的向量进行余弦相似度计算
        // 3.按照相似度排序，返回前topK个数据
        const results = await this.vectorStore.similaritySearchWithScore(query, topK);
        return {
            query,
            results: results.map(([doc, score])=>({
                content: doc.pageContent,
                source: doc.metadata.source,
                score: parseFloat(score.toFixed(4)),//值越高越相关，范围是0-1
            }))
        }
    }
    // 完整的rag回答，调用大模型
    async query(question: string, topK: number = 3){
        if(!this.vectorStore){
            return {
                error:'知识库未加载，请先调用 /rag/load 加载文档'
            }
        }
        // step1:检索相关文档块
        const retrieved = await this.vectorStore.similaritySearchWithScore(question, topK);
        if(!retrieved.length ){
            return {
                question,
                answer:'知识库中没有找到相关内容',
                sources:[]
            }
        }
        // step2:把检索结果拼成context字符串
        // [1] 第一块内容...\n\n[2] 第二块内容...\n\n[3] 第三块内容...
        // 编号方便模型在回答时引用："根据[1]..."
        const context = retrieved.map(([doc],index)=>`[${index+1}] ${doc.pageContent}`).join('\n\n');
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
                score: parseFloat(score.toFixed(4)),//值越高越相关，范围是0-1
            }))
        }
    }
    // 清空知识库
    clearKnowledge(){
        this.vectorStore = null;
        this.docCount = 0;
        return {
            success:true,
            message:'知识库已清空'
        }
    }
}
