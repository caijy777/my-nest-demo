import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {config} from '../config';

@Injectable()
export class AgentsService {
    private llm = new ChatOllama({
        model: config.ollama.chatModel,
        baseUrl: config.ollama.host,
        temperature: config.ollama.temperature,
        think: false, //是否开启思考模式，开启后会返回思考过程
        numPredict: 512, //预测token数，默认512，最大1024，最小1
    });
  
    /**
     * tool 把普通函数包装成大模型能识别的格式
     * 
     * name 是工具的名称（模型调用时会使用这个名称）
     * description 是工具的描述，告诉大模型这个工具的作用是做什么的
     * schema 定义工具的输入参数（zod格式）
     */
    
    //工具1：查询商品库存和价格的工具，输入参数为商品名称，输出是一个字符串，包含商品库存和价格
    // private checkProductTool = tool(
    //     ({productName}:{productName:string})=>{
    //         const products:Record<string,{stock:number;price:number;category:string}>={
    //         }
    //     },
    //     {

    //     }
    // )
    async runAgent(message:string){
        return {message}
    }
}
