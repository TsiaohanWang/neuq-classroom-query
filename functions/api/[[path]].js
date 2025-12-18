export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    
    // 只处理特定路径
    if (!url.pathname.startsWith('/api/')) {
        return new Response('Not Found', { status: 404 });
    }
    
    // 构建目标URL
    const targetUrl = `https://jwxt.neuq.edu.cn${url.pathname.replace('/api', '')}${url.search}`;
    
    // 修改请求头
    const headers = new Headers(request.headers);
    headers.set('Host', 'jwxt.neuq.edu.cn');
    headers.set('Referer', 'https://jwxt.neuq.edu.cn');
    headers.set('Origin', 'https://jwxt.neuq.edu.cn');
    
    // 删除可能引起问题的头
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ipcountry');
    headers.delete('cf-ray');
    
    try {
        const response = await fetch(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.body,
            redirect: 'manual'
        });
        
        // 处理重定向
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('Location');
            if (location) {
                return Response.redirect(location, response.status);
            }
        }
        
        // 返回响应
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        
        return new Response(response.body, {
            status: response.status,
            headers: responseHeaders
        });
    } catch (error) {
        return new Response(JSON.stringify({ 
            error: error.message,
            code: error.code 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}