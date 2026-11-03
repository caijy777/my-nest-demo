import { Injectable } from '@nestjs/common';
import {BaseMessage, SystemMessage, HumanMessage, AIMessage} from '@langchain/core/messages'
import { ChatOllama } from '@langchain/ollama';
import {config} from '../config';
import type { Response } from 'express';

@Injectable()
/*
    模型本身是无状态的，每次 invoke 都是全新对话。Memory 通过手动维护消息历史，把上文注入每次请求，实现"记忆"效果。

    原理：
    用 Map<sessionId, BaseMessage[]> 存每个会话的历史
    每次发消息：取出历史 → 追加新消息 → 发给模型 → 把回复存回历史

    sessionId 作为会话标识，同一个 sessionId 共享一份历史
*/
export class MemoryService {
    private llm = new ChatOllama({
        model: config.ollama.chatModel,
        baseUrl: config.ollama.host,
        temperature: config.ollama.temperature,
        think: false, //是否开启思考模式，开启后会返回思考过程
        numPredict: 512, //预测token数，默认512，最大1024，最小1
    });
    private sessions = new Map<string, BaseMessage[]>()
    private systemMessage = new SystemMessage(
        '你是一个智能助手，能记住对话历史，根据上下文回答问题'
    )
    private getOrCreate(sessionId:string):BaseMessage[]{
        if(!this.sessions.has(sessionId)){
            // 新会话，初始化加入系统消息
            this.sessions.set(sessionId,[this.systemMessage])
        }
        return this.sessions.get(sessionId)! //末尾的!是断言，表示确定有值，不会报错
    }

    // 模拟会话历史
    async chat(sessionId: string, message: string){
        const history = this.getOrCreate(sessionId)
        // 把用户新的消息加入历史记录
        history.push(new HumanMessage(message))
        // 把完整的历史发给模型（包括system,历史对话,本次消息）
        const response = await this.llm.invoke(history)
        // 把模型的回复加入历史记录，下次对话继续携带
        history.push(response)
        return {
            sessionId,
            message,
            reply: response.content,
            turns: Math.floor((history.length-1)/2)
        }
    }

    // 查看会话历史
    getHistory(sessionId: string){
        const history = this.sessions.get(sessionId)//history是BaseMessage数组
        if(!history){
            return {
                sessionId,
                exist: false,
                messages: []
            }
        }
        const messages = history
            .filter(m=>!(m instanceof SystemMessage))
            .map((m,i)=>({
                index: i+1,
                content:m.content,
                role: m instanceof HumanMessage?'user':'assistant'
            }))
        return {
            sessionId,
            exist: true,
            messages
        }
    }

    // 清空会话历史
    clearHistory(sessionId: string){
        if(!this.sessions.has(sessionId)){
            return {
                sessionId,
                cleared: false,
                message: '会话不存在'
            }
        }
        // 清空会话历史，只保留系统消息（该会话sessionId还在，只是历史为空了，若要删除会话，直接调用sessions.delete(sessionId)即可）
        this.sessions.set(sessionId, [this.systemMessage])
        return {
            sessionId,
            cleared: true,
            message: '会话历史已清空'
        }
    }

    // 获取所有会话历史列表
    listSessions(){
        const sessions = Array.from(this.sessions.entries()).map(([sessionId, history])=>({
            sessionId,
            trurns: Math.floor((history.length-1)/2)
        }))
        return {
            total: sessions.length,
            sessions
        }
    }

    // 多轮对话（SSE流式版本）
    async chatStream(sessionId: string, message: string, res: Response){
        res.setHeader('Content-Type', 'text/event-stream')//设置响应头为事件流格式
        res.setHeader('Cache-Control','no-cache')//禁用缓存
        res.setHeader('Connection','keep-alive')//保持连接
        res.setHeader('Access-Control-Allow-Origin','*')//允许所有域访问，实际项目中需要根据情况设置成具体的域名

        const history = this.getOrCreate(sessionId)
        history.push(new HumanMessage(message))
        
        let fullReply=''
        const stream = await this.llm.stream(history)
        for await (const chunk of stream){
            if(chunk.content){
                let text = String(chunk.content)
                fullReply+= text
                res.write(`data: ${JSON.stringify({text, sessionId})}\n\n`)
            }
        }
        // 把模型的完整回复加入历史记录，下次对话继续携带
        history.push(new AIMessage(fullReply))
        // 流结束后，返回完整回复
        res.write(`data: ${JSON.stringify({text:'[DONE]',turns: Math.floor((history.length-1)/2)})}\n\n`)
        // 关闭连接
        res.end()
    }
}
