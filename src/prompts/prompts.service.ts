import { Injectable } from '@nestjs/common';
import { ChatPromptTemplate, FewShotPromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/ollama';
import { config } from '../config';

@Injectable()
export class PromptsService {
  private llm = new ChatOllama({
    model: config.ollama.chatModel,
    baseUrl: config.ollama.host,
    temperature: config.ollama.temperature,
    think: false, //是否开启思考模式，开启后会返回思考过程
    numPredict: 512, //预测token数，默认512，最大1024，最小1
  });

  // 多消息对话模版，适合需要上下文的对话场景，模型会根据之前的消息内容进行回答
  async translate(text: string, targetLanguage: string) {
    // 这里可以调用第三方的翻译api，如谷歌翻译
    // fromMessages：从消息里面生成新的提示词。接收一个消息数组，每个消息有一个角色(system,user,assistant)和内容组成，模板中可以使用占位符{text}和{targetLanguage}来动态
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        '你是一个专业的翻译助手，只能输出翻译结果，帮助用户将文本翻译成指定的语言',
      ],
      ['user', '将以下文本内容翻译成{targetLanguage}：{text}'],
    ]);
    // pipe将prompt、llm、outputParser连接起来，形成一个链
    // 链的执行顺序是：prompt -> llm -> outputParser
    // prompt.invoke({text, targetLanguage})会把用户输入的text和targetLanguage替换到prompt中，
    // 生成一个完整的prompt，再调用llm生成一个response，最后调用outputParser解析response，返回翻译结果
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const result = await chain.invoke({
      text,
      targetLanguage,
    });
    return {
      original: text,
      targetLanguage,
      translated: result,
    };
  }

  async summarize(text: string, maxWords: number) {
    // fromTemplate：从模板里面生成新的模板。这里maxWords是用户输入的最大字数，模型会根据这个数来总结文本
    const prompt = ChatPromptTemplate.fromTemplate(
      '请把以下内容总结成不超过{maxWords}个字的版本: {text}',
    );
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const result = await chain.invoke({
      text,
      maxWords,
    });
    return {
      original: text,
      maxWords,
      summarized: result,
    };
  }

  // 少量样本学习模版fewShotPromptTemplate，适合需要根据少量样本例进行分类的场景
  // 例如，情感分析、文本分类等
  async classify(text: string) {
    const examples = [
      { input: '这个产品太棒了！', output: '正面' },
      { input: '完全不值这个价格', output: '负面' },
      { input: '还可以吧，普通', output: '中性' },
      { input: '强烈推荐！超出预期', output: '正面' },
      { input: '很失望，不会再买了', output: '负面' },
    ];
    // 每个示例的格式模板（FewShotPromptTemplate 要求 examplePrompt 是 PromptTemplate 字符串模板，不能用 ChatPromptTemplate）
    const examplePrompt = PromptTemplate.fromTemplate(
      '输入：{input}\n输出：{output}',
    );
    const fewShotPrompt = new FewShotPromptTemplate({
      examples,
      examplePrompt,
      prefix: '请根据输入的内容进行情感分类，只输出：正面、负面、中性之一。',
      suffix: '输入：{input}\n输出：',
      inputVariables: ['input'],
    });

    const formattedPrompt = await fewShotPrompt.format({ input: text });
    const response = await this.llm.invoke(formattedPrompt);

    return { text, sentiment: String(response.content).trim() };
  }

  // 代码审查，输入代码和语言，输出审查结果
  async codeReview(code: string,language:string) {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '你是一个资深的{language}代码审查助手，帮助用户找出代码中的错误和改进建议'],
      ['human', '请帮我审查一下的{language}代码，并指出其中的错误和改进建议：\n{code}'],
    ]);
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const result = await chain.invoke({
      code,
      language,
    });
    return { language, code, review: result };
  }
}