# -*- coding: utf-8 -*-
import hashlib
import hmac
import json
import sys
import time
from datetime import datetime
from typing import List, Optional
import logging

import requests

logging.basicConfig(level=logging.DEBUG)


def _parse_response(response):
    resp_list = []
    if "Response" in response:
        data = response["Response"]
        if "Pages" in data:
            webPages = data["Pages"]
            # TODO 待处理
            num = 0
            for item_str in webPages:
                num += 1
                item = json.loads(item_str)
                resp_list.append(
                    {
                    "id": item.get("id", num),
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "summary": item.get("passage", ""),
                    "detail": item.get("passage", ""),
                    "siteName": item.get("siteName", ""),
                    "siteIcon": item.get("favicon", ""),
                    "datePublished": item.get("date", ""),
                    "score": item.get("score", 0)
                    }
                )
            resp_list.sort(key=lambda item: item.get("score"), reverse=True)
    return resp_list


def sign(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

# 实例化一个认证对象，入参需要传入腾讯云账户 SecretId 和 SecretKey，此处还需注意密钥对的保密
# 代码泄露可能会导致 SecretId 和 SecretKey 泄露，并威胁账号下所有资源的安全性。以下代码示例仅供参考，建议采用更安全的方式来使用密钥，请参见：https://cloud.tencent.com/document/product/1278/85305
# 密钥可前往官网控制台 https://console.cloud.tencent.com/cam/capi 进行获取


import os


def search_tencent(
    query: str, 
    secret_id: str = os.environ.get("TENCENT_SECRET_ID"), 
    secret_key: str= os.environ.get("TENCENT_SECRET_KEY"), 
    count: int = 10
):
    """Search using tencent's Search API and return the results as a list.

    Args:
        secret_id (str): A tencent Search secret_id
        secret_key (str): A tencent Search secret_key
        query (str): The query to search for
    """
    token = ""

    service = "tms"
    host = "tms.tencentcloudapi.com"
    region = ""
    version = "2020-12-29"
    action ="SearchPro"  #  "TextModeration"
    payload_dict: dict = {
        "Query": query,
        # "Version": version,
        # "Action": action
        }
    payload = json.dumps(payload_dict)
    
    # params = json.loads(payload)
    # endpoint = "https://tms.tencentcloudapi.com"
    algorithm = "TC3-HMAC-SHA256"
    timestamp = int(time.time())
    date = datetime.utcfromtimestamp(timestamp).strftime("%Y-%m-%d")

    # ************* 步骤 1：拼接规范请求串 *************
    http_request_method = "POST"
    canonical_uri = "/"
    canonical_querystring = ""
    ct = "application/json; charset=utf-8"
    canonical_headers = "content-type:%s\nhost:%s\nx-tc-action:%s\n" % (ct, host, action.lower())
    signed_headers = "content-type;host;x-tc-action"
    hashed_request_payload = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_request = (http_request_method + "\n" +
                        canonical_uri + "\n" +
                        canonical_querystring + "\n" +
                        canonical_headers + "\n" +
                        signed_headers + "\n" +
                        hashed_request_payload)

    # ************* 步骤 2：拼接待签名字符串 *************
    credential_scope = date + "/" + service + "/" + "tc3_request"
    hashed_canonical_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = (algorithm + "\n" +
                    str(timestamp) + "\n" +
                    credential_scope + "\n" +
                    hashed_canonical_request)

    # ************* 步骤 3：计算签名 *************
    secret_date = sign(("TC3" + secret_key).encode("utf-8"), date)
    secret_service = sign(secret_date, service)
    secret_signing = sign(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()

    # ************* 步骤 4：拼接 Authorization *************
    authorization = (algorithm + " " +
                    "Credential=" + secret_id + "/" + credential_scope + ", " +
                    "SignedHeaders=" + signed_headers + ", " +
                    "Signature=" + signature)

    # ************* 步骤 5：构造并发起请求 *************
    headers = {
        "Authorization": authorization,
        "Content-Type": "application/json; charset=utf-8",
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Timestamp": str(timestamp),
        "X-TC-Version": version
    }
    if region:
        headers["X-TC-Region"] = region
    if token:
        headers["X-TC-Token"] = token

    try:

        response = requests.post("https://" + host, headers=headers, data=payload.encode("utf-8"))
        response.raise_for_status()
        return _parse_response(response.json())
    except Exception as err:
        print(err)

from typing import Dict, List
import requests
import json


def network_retrieval_bocha(query):
    """
    联网搜索，返回AI搜索结果列表。
    :param query: str,
    :return: List[dict],
    """
    url = "https://api.bochaai.com/v1/ai-search"
    payload = json.dumps({
        "query": f"{query}",
        "freshness": "oneYear",
        "count": 50,
        "answer": False,
        "stream": False,
    })
    headers = {
        'Authorization': 'sk-5caab5d8495f4ac08e5eda4e34802816',
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
    }
    response = requests.request("POST", url, headers=headers, data=payload)
    txt = response.json()
    res = json.loads(txt['messages'][0]['content'])['value']
    return res


##
def rerank_bocha(query, documents: list):
    """
        语义重排序，返回Top-N排序索引与分数。
        :param query: str,
        :param documents: List[str],
        :return: List[tuple],
        """
    url = "https://api.bochaai.com/v1/rerank"
    payload = json.dumps({
        "model": "gte-rerank",
        "query": query,
        "documents": documents,
        "return_documents": True,
    })
    headers = {
        'Authorization': 'sk-5caab5d8495f4ac08e5eda4e34802816',
        'Content-Type': 'application/json',
    }
    response = requests.request("POST", url, headers=headers, data=payload)
    if response and response.status_code == 200 and 'data' in response.json():
        return [(info['index'], info['relevance_score']) for info in response.json()['data']['results']]
    else:
        return []


def rerank(query, documents: List[str], web_pages: List[Dict]):
    """
    语义重排序，返回Top-N排序索引与分数。
    :param query: str,
    :param documents: List[str], web_pages 中的 summary
    :param exist_corpus: List[str], 从知识库检索到的语料
    :param web_pages: List[Dict], 从网络（如腾讯）检索到的网页
    :return: List[tuple],
    """
    ranked_pages = rerank_bocha(query, documents)
    show_pages = []
    for index, score in ranked_pages:
        if score < 0.4:
            break
        show_pages.append(web_pages[index])
    return show_pages


def search_web(query: str) -> str:
    tencent_results = search_tencent(query) # search_tencent(keywords + " " + query)

    documents = [item.get("summary", "") for item in tencent_results]
    reranked_results = rerank(query, documents, tencent_results)
    return "\n".join([r.get("summary") for r in reranked_results]), reranked_results


if __name__ == "__main__":
    resp_summary, resp_list = search_web(query="使用sharding-jdbc进行分库分表，如何结合用户ID(user_id)和时间范围进行分片")
    print(resp_summary)

