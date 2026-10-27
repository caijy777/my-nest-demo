import { Injectable } from '@nestjs/common';
import {ChatOllama} from '@langchain/ollama';
import {config} from '../config';
import {HumanMessage, SystemMessage} from '@langchain/core/messages';
import type { Response } from 'express';
import {StringOutputParser} from '@langchain/core/output_parsers';


@Injectable()
export class ModelsService {
    // 创建ollama实例
    private llm = new ChatOllama({
        model: config.ollama.chatModel,
        baseUrl: config.ollama.host,
        temperature: config.ollama.temperature,
        think: false,//是否开启思考模式，开启后会返回思考过程
        numPredict: 512,//预测token数，默认512，最大1024，最小1
    });
    // 基础聊天，没有流式调用，适合一次性返回完整回答
    async baseChat(message: string){
        const res = await this.llm.invoke([
            new HumanMessage(message),
        ])
        console.log(res)
        return {
            question: message,
            answer: res.content,
            usage: res.usage_metadata,//包含token使用情况
        }
    }
    // 带系统设定的聊天，适合需要根据系统设定进行回答的情况
    async chatSystem({system, message}: {system:string, message: string}){
        const res = await this.llm.invoke([
            new SystemMessage(system),//可选的系统消息，设定模型角色和行为
            new HumanMessage(message),//用户输入的问题
        ])
        return {
            system,
            question: message,
            answer: res.content,
            usage: res.usage_metadata,//包含token使用情况
        }
    }
    // 流式输出，适合需要实时返回回答的情况
    // 注意：流式输出需要在controller中添加@Res() res: Response参数
    async chatStream({message}: {message:string}, res: Response){
        // 设置响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');//允许跨域访问，实际项目中需要根据实际情况设置具体的域名
        const stream = await this.llm.stream([//流式调用，返回一个可迭代对象
            new HumanMessage(message),
        ])
        console.log('stream---------',stream)
        for await (const chunk of stream) {
            console.log('chunk---------',chunk)
            res.write(`data:${JSON.stringify(chunk)}\n\n`)
        }
        // 当流式调用完成时，发送特殊事件通知客户端
        res.write(`data: [DONE]\n\n`)
        res.end()
    }
// pipeline组合多个模型一起使用，先用一个模型生成提示词，再用另一个模型根据提示词生成回答
// 把模板、模型、解析器三步串成一个链
    async chatWithParser(message: string){
        // prompt 模板，包含一个占位符，用于接收用户输入的问题
        // llm
        // parser解析器，用于从模型输出中提取结构化数据
        const chain = this.llm.pipe(new StringOutputParser());
        const answer = await chain.invoke([
            new HumanMessage(message),
        ])
        // answer 直接是一个字符串，不需要从response.content中提取了，正常情况下它是一个AIMessage对象
        return {
            question: message,
            answer,
        }
    }
}