import { Injectable } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import {tool} from '@langchain/core/tools';
import {SystemMessage, HumanMessage, ToolMessage, AIMessage} from '@langchain/core/messages';
import {z} from 'zod';
import {config} from '../config';

@Injectable()
export class AgentsService {
    private llm = new ChatOllama({
        model: config.ollama.chatModel,
        baseUrl: config.ollama.host,
        temperature: 0.1,
        think: false, //是否开启思考模式，开启后会返回思考过程
        numPredict: 1024, //预测token数，默认512，最大1024，最小1
    });
  
    /**
     * tool 把普通函数包装成大模型能识别的格式，第一个参数是函数，第二个参数是对函数的描述
     *   name 是工具的名称（模型调用时会使用这个名称）
     *   description 是工具的描述，告诉大模型这个工具的作用是做什么的
     *   schema 定义工具的输入参数（zod格式）
     */
    
    //工具1：查询商品库存和价格的工具，输入参数为商品名称，输出是一个字符串，包含商品库存和价格
    private checkProductTool = tool(
        async ({productName}:{productName:string})=>{
            const products:Record<string,{stock:number;price:number;category:string}>={
                'iPhone 18':     { price: 7999,  stock: 50, category: '手机' },
                'iPhone 18 Pro': { price: 9999,  stock: 20, category: '手机' },
                'MacBook Pro':   { price: 15999, stock: 8,  category: '电脑' },
                'AirPods Pro':   { price: 1799,  stock: 200, category: '耳机' },
                'iPad Air':      { price: 4799,  stock: 30, category: '平板' },
            }
            const product = products[productName];
            if(!product){
                return `没有找到商品${productName}相关信息`;
            }
            if(product.stock===0){
                return `商品${productName}当前缺货`;
            }
            return `商品：${productName}，库存：${product.stock}，价格：${product.price}，分类：${product.category}`;
        },
        {
            name:'check_product',
            description:'查询商品库存和价格的工具，输入参数为商品名称，输出是一个字符串，包含商品库存和价格',
            schema:z.object({
                productName:z.string().describe('要查询的商品名称，例如iPhone 18'),
            }),
        }
    )

    // 工具2：创建订单的工具，输入参数为商品名称，输出是一个字符串，包含订单信息
    private createOrderTool = tool(
        async ({productName,quantity,customerName}:{productName:string;quantity:number;customerName:string})=>{
            const prices:Record<string,number>={
                'iPhone 18':7999,
                'iPhone 18 Pro':9999,
                'MacBook Pro':15999,
                'AirPods Pro':1799,
                'iPad Air':4799,
            }
            // 商品单价
            const unitPrice = prices[productName]??0;
            // 商品总价
            const totalPrice = unitPrice*quantity;
            if(!unitPrice){
                return `无法创建订单，没有找到商品${productName}的价格信息`;
            }
            const orderId = `ORDER-${Date.now().toString().slice(-6)}`
            return `成功创建订单，订单ID：${orderId}，商品：${productName}，数量：${quantity}，客户姓名：${customerName}，总价：${totalPrice}`;
        },
        {
            name:'create_order',
            description:'创建订单的工具，输入参数为商品名称、数量、客户姓名，输出是一个字符串，包含订单信息',
            schema:z.object({
                productName:z.string().describe('要创建订单的商品名称'),
                quantity:z.number().describe('要创建订单的商品数量'),
                customerName:z.string().describe('要创建订单的客户姓名'),
            }),
        }
    )

    // 工具3：查询订单状态
    private checkOrderTool = tool(
        async ({orderId}:{orderId:string})=>{
            // 模拟订单状态，实际应用中需要从数据库中查询或其他方式获取
            const status = ['待支付','已支付','待发货','已发货' ,'已完成','已取消'];
            const randomStatus = status[Math.floor(Math.random()*status.length)];
            // const extra = randomStatus==='已取消'?'订单因库存不足被取消':''
            return `订单ID：${orderId}，当前状态：${randomStatus}`
        },
        {
            name:'check_order',
            description:'查询订单状态的工具，输入参数为订单ID，输出是一个字符串，包含订单状态',
            schema:z.object({
                orderId:z.string().describe('要查询的订单ID，例如ORDER-123456'),
            }),
        }
    )

    // 工具4：申请退款
    private refundTool = tool(
        async ({orderId, reason}:{orderId:string;reason:string})=>{
            const refundId = `REFUND-${Date.now().toString().slice(-6)}`
            return `成功提交退款申请，退款ID：${refundId}，订单ID：${orderId}，退款原因：${reason}`;
        },
        {
            name:'refund_tool',
            description:'申请退款的工具，输入参数为订单ID、退款原因，输出是一个字符串，包含退款信息',
            schema:z.object({
                orderId:z.string().describe('要申请退款的订单ID，例如ORDER-123456'),
                reason:z.string().describe('退款原因，例如商品描述与实际商品不符'),
            }),
        }
    )

    async runAgent(message:string){
        const tools = [this.checkProductTool,this.createOrderTool,this.checkOrderTool,this.refundTool];
        const toolMap:Record<string, any>={
            check_product:this.checkProductTool,
            create_order:this.createOrderTool,
            check_order:this.checkOrderTool,
            refund_tool:this.refundTool,
        }
        // bindTools 方法可以将工具绑定到llm中，使llm在生成回答时能够使用这些工具，
        // 模型会根据用户的输入和对话上下文，自动选择合适的工具来执行
        // 注册成功后，模型回复里会包含tools_call字段，告诉我们模型调用了哪些工具，以及每个工具的输入参数是什么
        const llmTools = this.llm.bindTools(tools);
        // 消息历史
        const messages:any[]=[
            new SystemMessage(`你是一个【极速购】电商平台的AI智能客服助手，帮助用户查询商品库存信息、创建订单、查询订单状态、申请退款。
                    你可以使用以下工具帮助客户：
                    - check_product: 查询商品库存信息的工具，输入参数为商品名称，输出是一个字符串，包含商品库存信息
                    - create_order: 创建订单的工具，输入参数为商品名称、数量、客户姓名，输出是一个字符串，包含订单信息
                    - check_order: 查询订单状态的工具，输入参数为订单ID，输出是一个字符串，包含订单状态信息
                    - refund_tool: 申请退款的工具，输入参数为订单ID、退款原因，输出是一个字符串，包含退款信息
                    工作流程示例：
                    1. 先用工具获取真实信息，再给用户回复
                    2. 下单前必须先查询商品库存，确认有货才能下单
                    3. 下单时必须知道用户的姓名，如果用户没有提供姓名，要先询问用户姓名
                    4. 回答简洁友好，使用中文
                `),
            new HumanMessage(message),
        ]

        // 记录一下每步执行的过程，用于前端展示、调试
        const steps:string[]=[]
        /*
        `roundCount` 在这里同时承担了 两个角色 ：
            1. 计数器 ：记录"已经向模型发起了几次调用"
            2. 循环守卫 ：控制最多调用 6 次，防止死循环
            把`roundCount++` 放在循环体的第一句，能保证"每进入一轮、每发起一次`invoke` ，计数就已经加 1"。
        */ 
        let roundCount = 0//LLM 调用轮数，不是"工具调用轮数"
        // 定义一个递归函数来处理模型回答和工具调用
        while(roundCount<6){//检查时 roundCount 表示"已完成轮数"
            roundCount++;//进入本轮，变成"当前是第几轮 / 已发起调用次数"
            console.log(`agent演示----------------第${roundCount}轮`)
            const response=await llmTools.invoke(messages)
            messages.push(response)//把模型回答添加到消息历史中，让模型在下一轮回答时可以看到之前的对话内容和工具调用结果
            // tool_calls 是模型回答里的一个特殊字段，告诉我们模型在这一轮回答调用了哪些工具，以及每个工具的输入参数是什么
            // 我们可以根据这个信息来调用对应的工具函数，获取工具的输出结果，然后把结果返回给模型，让模型继续生成回答
            // 如果模型没有调用任何工具，说明模型已经完成了任务，直接返回模型回答
            // 如果模型调用了工具，说明模型还在继续执行任务，需要递归调用这个函数，继续处理工具调用的结果
            if(!response.tool_calls||response.tool_calls.length===0){
                steps.push(`【最终回答】模型回答：${response.content}`)
                break;
            }
            // 模型决定调用工具，依次执行所有工具的调用
            for(const call of response.tool_calls){
                steps.push(`【模型调用工具】：${call.name}，输入参数：${JSON.stringify(call.args)}`)
                console.log('【模型调用工具】：----', call.name, call.args);
                const toolFunc=toolMap[call.name]//根据工具映射表中找到对应的工具函数
                if(!toolFunc){
                    const errorMsg=`未找到工具函数${call.name}`
                    steps.push(`【错误】${errorMsg}`)
                    messages.push(new ToolMessage({
                        content: errorMsg,
                        tool_call_id: call.id??'',
                    }))
                    continue;
                }
                // 调用工具函数，获取结果
                const toolResult=await toolFunc.invoke(call.args)//调用工具函数，获取工具的输出结果
                steps.push(`【工具执行结果】：${toolResult}`)
                console.log('【工具执行结果】：----',toolResult);
                // 将工具的结果作为新的消息添加到消息历史中，让模型在下一轮回答时可以看到这个结果
                messages.push(new ToolMessage({
                        content: String(toolResult),
                        tool_call_id: call.id??'',
                    }))
            }
        }
        // lastAI类型推断为：AIMessage | undefined，从消息历史里 挑出 最后一条`AIMessage` （筛选/查找）。
        const lastAI=[...messages].reverse().find(msg=>msg instanceof AIMessage)
        // 处理" 没挑到 "的情况（兜底），如果lastAI是AIMessage类型，就返回它的content，否则返回'很抱歉，我无法处理您的请求。'
        const answer=lastAI?.content??'很抱歉，我无法处理您的请求。'
        return {
            message,
            steps,
            totalRound:roundCount,
            answer
        }
    }
}

/*
代码解析：

# 一、`tool` 函数的用法

tool 是 `@langchain/core/tools` 提供的辅助函数，作用是把一个**普通的 TypeScript 函数**包装成 **LangChain 能识别、大模型能调用的"工具"对象**。签名大致是：

```ts
tool(执行函数, 工具元信息配置)
```

## 第一个参数：真正干活的函数

以checkProductTool为例：

```ts
async ({productName}:{productName:string})=>{
    // ...业务逻辑（查库存、创建订单等）
    return `商品：${productName}，库存：${product.stock}...`;
}
```

- `({productName})` 是**解构**写法：LangChain 调用这个函数时会传入一个对象，这里直接从中取出 `productName` 属性
- `:{productName:string}` 是 TypeScript 类型注解，声明整个参数对象的形状
- **返回值必须是字符串**——这个字符串不会直接给用户，而是会回传给大模型，作为"工具执行结果"，让模型基于它继续推理

## 第二个参数：工具的"说明书"

```ts
{
    name:'check_product',        // 工具名，模型调用时用这个名字标识
    description:'查询商品库存和价格的工具...',  // 告诉模型这个工具能干什么
    schema:z.object({...})       // 用 zod 定义输入参数的结构
}
```

这三个字段非常关键，因为大模型**看不到函数体**，它只靠这三样东西来决定"要不要调用这个工具、调用时该填什么参数"。

# 二、zod 语法介绍

zod是 TypeScript 生态流行的**数据模式（Schema）校验库**，用代码描述"数据长什么样"，并在运行时自动校验。常用语法：

| 写法 | 含义 |
|---|---|
| `z.object({...})` | 定义一个对象结构 |
| `z.string()` | 字符串字段 |
| `z.number()` | 数字字段 |
| `z.array(z.string())` | 字符串数组 |
| `z.enum(['a','b'])` | 枚举，只能取列出的值 |
| `.describe('说明文字')` | 给字段加描述（**会传给大模型看**） |
| `.optional()` | 可选字段 |

## 这段代码在做什么

```ts
schema:z.object({
    productName:z.string().describe('要查询的商品名称，例如iPhone 18'),
}),
```

逐行拆解：这句话声明了 `check_product` 工具的**输入参数结构**——"调用我时必须传一个对象，对象里有一个 `productName` 字段，是字符串，含义是要查询的商品名称"。

它在整个链路中的数据流转是这样的：

```
1. zod schema ──(LangChain 转成 JSON Schema)──> 随 bindTools 发给大模型
2. 模型看到 schema，知道调用 check_product 需要 productName 参数
3. 模型决定调用时，生成 tool_calls: [{name:'check_product', args:{productName:'iPhone 18'}}]
4. LangChain 拿 args 按 schema 校验/解析，传给你的第一个参数（执行函数）
```

`.describe()` 里的文字就是模型填参数时的"填表说明"，写得越具体（比如给出示例 "iPhone 18"），模型填得越准。

# 三、`runAgent` 函数详解

runAgent实现的是 Agent 最核心的 **ReAct 循环**（Reasoning + Acting）：模型思考 → 调工具 → 看结果 → 再思考 → … → 最终回答。

**第 1 步：准备工具和映射表**
把 4 个工具放进数组传给模型；`toolMap` 是 `工具名 → 工具对象` 的映射，后面收到模型的调用请求时按名字查找对应函数。

**第 2 步：绑定工具**
```ts
const llmTools = this.llm.bindTools(tools);
```
`bindTools` 返回一个"带工具定义"的新模型实例，之后每次 `invoke` 都会携带工具的 name/description/schema。模型若认为需要，回复里就会带 `tool_calls` 字段。

**第 3 步：构建消息历史**
- `SystemMessage`：系统提示词，定义角色（电商客服）和工作规则（如"下单前必须先查库存"）
- `HumanMessage`：用户的实际问题

**第 4 步：核心循环**，每一轮：

1. `llmTools.invoke(messages)` 让模型生成回答
2. 把模型回答 push 回 `messages` —— **必须保留**，因为后面的 `ToolMessage` 要通过 `tool_call_id` 和它对应，丢了会报错
3. 判断 `response.tool_calls`：
   - **为空** → 模型给出最终自然语言答案，`break` 结束循环
   - **不为空** → 遍历执行每个工具调用：
     - 从 `toolMap` 找函数；找不到就构造一条错误 `ToolMessage` 回传（**这是正确做法**：每个 `tool_call_id` 必须有对应的 ToolMessage，否则下一轮模型调用会报错）
     - `toolFunc.invoke(call.args)` 真正执行工具
     - 结果包成 `ToolMessage`（带 `tool_call_id`）push 回历史
4. 进入下一轮：模型看到工具结果，继续决定"再调工具"还是"给最终答案"

`while(roundCount<6)` 限制最大 6 轮，防止模型无限循环调用工具。`steps` 数组记录了每一步（调了什么工具、参数是什么、结果是什么），方便前端展示执行轨迹或调试。

**第 5 步：提取最终答案**
从消息历史**倒序**找最后一条 `AIMessage` 作为最终回答，连同 `steps`、`totalRound` 一起返回。

## 一句话总结

`tool(函数, {name, description, schema})` = 用 zod 描述"函数怎么调"，让大模型看懂并自动填参数；`runAgent` = 一个"模型 ↔ 工具"来回对话的循环，直到模型给出不含工具调用的最终答案为止。
*/