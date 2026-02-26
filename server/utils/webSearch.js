
import crypto from 'crypto';
import fetch from 'node-fetch';

function sign(key, msg) {
    return crypto.createHmac('sha256', key).update(msg).digest();
}

function parseResponse(response) {
    let respList = [];
    if (response && response.Response) {
        const data = response.Response;
        if (data.Pages) {
            const webPages = data.Pages;
            let num = 0;
            for (const itemStr of webPages) {
                num += 1;
                // itemStr is a JSON string in the python script, but let's check if it's already an object here. 
                // The python script says `item = json.loads(item_str)`. 
                // If the API returns a list of strings, we parse them. If it returns objects, we use them.
                // Looking at Tencent API docs (or assuming based on python), it seems to be a list of strings if `json.loads` is used.
                let item;
                try {
                    item = typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr;
                } catch (e) {
                    console.error('Error parsing itemStr:', e);
                    continue;
                }

                respList.push({
                    id: item.id || num,
                    title: item.title || "",
                    url: item.url || "",
                    summary: item.passage || "",
                    detail: item.passage || "",
                    siteName: item.siteName || "",
                    siteIcon: item.favicon || "",
                    datePublished: item.date || "",
                    score: item.score || 0
                });
            }
            respList.sort((a, b) => b.score - a.score);
        }
    }
    return respList;
}

async function searchTencent(query, count = 10) {
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;

    if (!secretId || !secretKey) {
        throw new Error("Tencent API credentials not found.");
    }

    const service = "tms";
    const host = "tms.tencentcloudapi.com";
    const region = "";
    const version = "2020-12-29";
    const action = "SearchPro";
    const payloadDict = {
        "Query": query
    };
    const payload = JSON.stringify(payloadDict);

    const algorithm = "TC3-HMAC-SHA256";
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().split('T')[0];

    // ************* Step 1: Canonical Request String *************
    const httpRequestMethod = "POST";
    const canonicalUri = "/";
    const canonicalQuerystring = "";
    const ct = "application/json; charset=utf-8";
    const canonicalHeaders = `content-type:${ct}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = "content-type;host;x-tc-action";
    const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalRequest = [
        httpRequestMethod,
        canonicalUri,
        canonicalQuerystring,
        canonicalHeaders,
        signedHeaders,
        hashedRequestPayload
    ].join('\n');

    // ************* Step 2: String to Sign *************
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = [
        algorithm,
        timestamp.toString(),
        credentialScope,
        hashedCanonicalRequest
    ].join('\n');

    // ************* Step 3: Signature *************
    const secretDate = sign(Buffer.from("TC3" + secretKey, 'utf-8'), date);
    const secretService = sign(secretDate, service);
    const secretSigning = sign(secretService, "tc3_request");
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    // ************* Step 4: Authorization Header *************
    const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // ************* Step 5: Request *************
    const headers = {
        "Authorization": authorization,
        "Content-Type": "application/json; charset=utf-8",
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Timestamp": timestamp.toString(),
        "X-TC-Version": version
    };
    if (region) headers["X-TC-Region"] = region;

    try {
        const response = await fetch(`https://${host}`, {
            method: 'POST',
            headers: headers,
            body: payload
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Tencent API request failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return parseResponse(data);
    } catch (err) {
        console.error("Tencent Search Error:", err);
        return [];
    }
}

async function rerankBocha(query, documents) {
    const url = "https://api.bochaai.com/v1/rerank";
    const apiKey = process.env.BOCHA_API_KEY; // Fallback to key from python script

    const payload = JSON.stringify({
        "model": "gte-rerank",
        "query": query,
        "documents": documents,
        "return_documents": true,
    });

    const headers = {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: payload
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.data && data.data.results) {
                return data.data.results.map(info => ({
                    index: info.index,
                    score: info.relevance_score
                }));
            }
        }
    } catch (error) {
        console.error("Bocha Rerank Error:", error);
    }
    return [];
}

async function rerank(query, documents, webPages) {
    const rankedPagesMetadata = await rerankBocha(query, documents);
    const showPages = [];

    // Convert rerank results to look like the python loop:
    // for index, score in ranked_pages:
    //     if score < 0.4: break
    //     show_pages.append(web_pages[index])

    // Note: Bocha API might assume documents list order is preserved in index, 
    // so `documents` passed to rerank must match `webPages` order.

    // Sort logic from python script implies that `rerankBocha` returns sorted results?
    // The python script just iterates over the returned list directly. 
    // The Bocha API response structure: `results` is a list of objects with `index` and `relevance_score`.
    // Usually rerank APIs return them sorted by score descending.

    for (const info of rankedPagesMetadata) {
        if (info.score < 0.4) {
            // Logic in python script: `break`.
            // Depending on if the API returns sorted results, this truncates the tail.
            // If not sorted, this might skip good results that just happened to be later in list?
            // Assuming sorted.
            break; // Python: break
        }
        if (webPages[info.index]) {
            showPages.push(webPages[info.index]);
        }
    }
    return showPages;
}

export async function searchWeb(query) {
    // Python: tencent_results = search_tencent(query)
    const tencentResults = await searchTencent(query);

    // Python: documents = [item.get("summary", "") for item in tencent_results]
    const documents = tencentResults.map(item => item.summary || "");

    // Python: reranked_results = rerank(query, documents, tencent_results)
    const rerankedResults = await rerank(query, documents, tencentResults);

    // Python: return "\n".join([r.get("summary") for r in reranked_results]), reranked_results
    const summary = rerankedResults.map(r => r.summary).join("\n");

    return {
        summary,
        results: rerankedResults
    };
}
