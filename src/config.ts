export const config = {
    ollama:{
        // 这里host是ollama服务器的地址
        host: "http://localhost:11434",
        chatModel:"qwen3.5:0.8b",
        embedModel:"mxbai-embed-large:latest",
        //温度，0-1之间，0表示确定，1表示随机，temperature越小越稳定，越大越随机
        temperature:0.2
    }
}