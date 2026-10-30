import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {config} from '../config';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

@Injectable()
export class ChainsService {
  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.host,
    temperature: config.ollama.temperature,
    think: false, //是否开启思考模式，开启后会返回思考过程
    numPredict: 512, //预测token数，默认512，最大1024，最小1
  });

  // 多步骤链调用，文章润色的示例
  async polish(article:string) {
    // 多步执行，每一步的执行都可以作为下一步的输入，适合分步骤处理的复杂任务
    // 文章润色例子：
    // 1. 分析文章存在的问题
    // 2. 根据分析结果，润色文章
    const analysisPrompt = ChatPromptTemplate.fromMessages([
      ['system','你是一个专业的文章分析助手，只输出问题列表，不要其他内容'],
      ['human','分析这篇文章存在的问题：{article}']
    ])
    const polishPrompt = ChatPromptTemplate.fromMessages([
      ['system','你是一个专业的文章润色助手，根据分析结果，对文章进行润色，改进文章的表达、结构、用词等方面，使文章更加专业、准确、流畅。'],
      ['human','根据以下分析结果润色这篇文章，分析结果是：{analysis}，文章内容是：{article}']
    ])
    // 第一条chain：article字符串-->分析-->analysis字符串
    const analysisChain = analysisPrompt.pipe(this.llm).pipe(new StringOutputParser());
    // 第二条chain：article原文字符串 + analysis字符串-->润色-->polish字符串
    // const polishChain = polishPrompt.pipe(this.llm).pipe(new StringOutputParser());
    
    // RunnableSequence 可以将前一个chain的输出作为后一个chain的输入，实现多步骤处理流程
    // RunnableSequence 的输入是一个对象，这个对象包含多个属性，每个属性可以通过RunnablePassthrough保留原始输入，或者通过其他chain处理后作为输入
    // RunnablePassthrough 是一个特殊的Runnable，它直接将输入传递给下一个Runnable，不进行任何处理，这样可以在多步骤流程中保留原始输入
    const fullChain = RunnableSequence.from([
      {//这里属性名字article和analysis可以随意定义，但是需要和上述ChatPromptTemplate.fromMessages中的占位符{article}和{analysis}保持一致
        article: new RunnablePassthrough(), //保留原文
        analysis: analysisChain // 调用分析chain得到分析结果
      },
      polishPrompt.pipe(this.llm).pipe(new StringOutputParser())// 调用润色chain得到润色结果
    ])
    const polishChain = await fullChain.invoke({article})
    return {
      original:article,
      polished: polishChain
    }
  }
  // 顺序链调用，生成博客的示例
  async generateBlog(keywords:string, style:string){
    // 三条链，顺序执行：上一步输出作为下一步输入
    // 关键词、风格-->博客大纲-->博客内容-->SEO博客标题
    const outlinePrompt = ChatPromptTemplate.fromMessages([
      ['system','你是一个专业的博客大纲生成助手，根据关键词和风格，生成博客大纲'],
      ['human','根据以下关键词和风格，生成博客大纲：{keywords}，{style}']
    ])
    const blogContentPrompt = ChatPromptTemplate.fromMessages([
      ['system','你是一个专业的博客内容生成助手，根据博客大纲，生成博客内容'],
      ['human','根据以下博客大纲，生成博客内容：{outline}']
    ])
    const seoPrompt = ChatPromptTemplate.fromMessages([
      ['system','你是一个专业的SEO博客标题生成助手，根据博客内容，生成3个不同的SEO博客标题'],
      ['human','根据以下博客内容，生成3个不同的SEO博客标题：{blogContent}']
    ])
    // 第一条chain：keywords字符串 + style字符串-->博客大纲字符串
    const outlineChain = outlinePrompt.pipe(this.llm).pipe(new StringOutputParser());
    // 第二条chain：outline字符串-->博客内容字符串
    const blogContentChain = blogContentPrompt.pipe(this.llm).pipe(new StringOutputParser());
    // 第三条chain：blogContent字符串-->SEO博客标题字符串
    const seoChain = seoPrompt.pipe(this.llm).pipe(new StringOutputParser());
    // 顺序执行：keywords字符串 + style字符串-->博客大纲字符串-->博客内容字符串-->SEO博客标题字符串
    const outline = await outlineChain.invoke({keywords, style})
    const blogContent = await blogContentChain.invoke({outline})
    const seo = await seoChain.invoke({blogContent})
    return {
      keywords,
      style,
      outline,
      blogContent,
      seo
    }
  }

  // 条件链调用，智能路由示例
  // 用户输入一个问题，模型会根据问题的内容和类型来判断应该用哪个功能模块来处理，比如翻译、总结、分类等
  async smartRouter(question:string){
    // 第一步分类
    const routerPrompt = ChatPromptTemplate.fromMessages([
      ['system',`分析用户的问题，只输出分类标签:
        技术问题-TECH
        退款问题-REFUND
        订单问题-ORDER
        投诉建议-COMPLAINT
        其他问题-OTHER
        `],
      ['human','{question}']
    ]).pipe(this.llm).pipe(new StringOutputParser())
    const category = await routerPrompt.invoke({question})

    // 第二步根据分类结果，选择调用不同的模块
    const systemMap:Record<string,string> = {
      TECH:'你是一个技术支持助手，帮助用户解决技术问题',
      REFUND:'你是一个退款助手助手，帮助用户解决退款问题',
      ORDER:'你是一个订单助手，帮助用户解决订单问题',
      COMPLAINT:'你是一个投诉处理助手，帮助用户解决投诉建议',
      OTHER:'你是一个通用助手，帮助用户解决其他问题'
    }
    const systemMessage = systemMap[category]||systemMap['OTHER']
    // 第三步把系统角色信息和用户问题一起传给模型，让模型根据不同角色信息来生成回答
    const answerPrompt = ChatPromptTemplate.fromMessages([
      ['system',systemMessage],
      ['human','{question}']
    ]).pipe(this.llm).pipe(new StringOutputParser())
    const answer = await answerPrompt.invoke({question})
    return {
      question,
      category,
      answer
    }
  }
}
