/**
 * 龙湖APP自动签到脚本 - v1.18.2增强版
 * 
 * 功能：
 * 1. 自动完成龙湖APP每日签到，获取积分
 * 2. 自动完成抽奖活动签到和抽奖
 * 兼容：Shadowrocket, Surge, Quantumult X, Loon
 */

// 配置常量
const CONFIG = {
    SCRIPT_NAME: '龙湖签到',
    TOKEN_KEY: 'longfor_token',
    SIGN_KEY: 'longfor_sign',
    TIMESTAMP_KEY: 'longfor_timestamp',
    COOKIE_KEY: 'longfor_cookie',
    DEBUG_MODE: false,
    RETRY_COUNT: 3,
    RETRY_DELAY: 2000,
    REQUEST_TIMEOUT: 10000,
    
    // API 配置 - 适配v1.18.2
    API: {
        SIGN_IN: "https://gw2c-hw-open.longfor.com/supera/member/api/bff/pages/v1_18_2/v2/sign-in",
        USER_INFO: "https://gw2c-hw-open.longfor.com/supera/member/api/bff/pages/v1_18_2/v2/user-info",
        USER_BALANCE: "https://gw2c-hw-open.longfor.com/supera/member/api/bff/pages/v1_18_2/v2/user-lz-balance",
        LOTTERY_SIGN: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/sign",
        LOTTERY_DRAW: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/click"
    },
    
    // 活动配置
    ACTIVITY: {
        SIGN_IN_NO: "11111111111736501868255956070000",
        LOTTERY_COMPONENT: "CO15400F29R2ZFJZ",
        LOTTERY_ACTIVITY: "AP25K062Q6YYQ7FX"
    },
    
    // 通用请求头 - 适配v1.18.2
    COMMON_HEADERS: {
        'Accept': '*/*',
        'Accept-Encoding': 'br;q=1.0, gzip;q=0.9, deflate;q=0.8',
        'Accept-Language': 'zh-Hant-ES;q=1.0, zh-Hant-TW;q=0.9, zh-Hans-ES;q=0.8, en-ES;q=0.7',
        'Content-Type': 'application/json',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'com.longfor.supera/1.18.2 iOS/15.6',
        'x-lf-api-version': 'v1_18_2',
        'x-lf-app-version': '1.18.2',
        'x-client-type': 'app',
        'x-lf-bundle-id': 'com.longfor.supera',
        'x-gaia-api-key': '98717e7a-a039-46af-8143-be7558a089c0',
        'x-lf-bucode': 'L00602',
        'x-lf-channel': 'L0',
        'x-lf-stage': 'RELEASE'
    }
}

// 工具函数
function log(message, level = 'INFO') {
    const timestamp = new Date().toLocaleTimeString()
    const prefix = CONFIG.DEBUG_MODE ? `[${timestamp}][${level}] ` : ''
    console.log(`${prefix}██ ${message}`)
}

function logError(message, error) {
    log(`${message}: ${error}`, 'ERROR')
}

function logDebug(message) {
    if (CONFIG.DEBUG_MODE) {
        log(message, 'DEBUG')
    }
}

function isEmpty(obj) {
    return typeof obj === "undefined" || obj === null || obj === "" || obj.length === 0
}

function getVal(key, defaultValue = '') {
    try {
        let value
        if (typeof $persistentStore !== 'undefined') {
            value = $persistentStore.read(key)
        } else if (typeof $prefs !== 'undefined') {
            value = $prefs.valueForKey(key)
        }
        return value || defaultValue
    } catch (e) {
        logError('获取存储值失败', e)
        return defaultValue
    }
}

function setVal(key, val) {
    try {
        if (typeof $persistentStore !== 'undefined') {
            return $persistentStore.write(val, key)
        } else if (typeof $prefs !== 'undefined') {
            return $prefs.setValueForKey(val, key)
        }
        return false
    } catch (e) {
        logError('设置存储值失败', e)
        return false
    }
}

function notify(subtitle, message, sound = '') {
    try {
        if (typeof $notification !== 'undefined') {
            $notification.post(CONFIG.SCRIPT_NAME, subtitle, message, sound)
        } else if (typeof $notify !== 'undefined') {
            $notify(CONFIG.SCRIPT_NAME, subtitle, message)
        } else {
            log(`通知: ${subtitle} - ${message}`)
        }
    } catch (e) {
        logError('发送通知失败', e)
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function validateToken(token) {
    return !isEmpty(token) && token.length > 10
}

function sanitizeToken(token) {
    return token ? `${token.substring(0, 10)}...` : '无效token'
}

// HTTP请求函数（带重试机制）
async function httpPost(options, retryCount = CONFIG.RETRY_COUNT) {
    return new Promise((resolve, reject) => {
        const attemptRequest = (attempt) => {
            logDebug(`HTTP请求尝试 ${attempt}/${CONFIG.RETRY_COUNT}: ${options.url}`)
            
            const requestOptions = {
                ...options,
                timeout: CONFIG.REQUEST_TIMEOUT
            }
            
            const handleResponse = (error, response, data) => {
                if (error) {
                    logError(`请求失败 (尝试 ${attempt})`, error)
                    if (attempt < retryCount) {
                        log(`等待 ${CONFIG.RETRY_DELAY}ms 后重试...`)
                        setTimeout(() => attemptRequest(attempt + 1), CONFIG.RETRY_DELAY)
                    } else {
                        reject(new Error(`请求失败，已重试 ${retryCount} 次: ${error}`))
                    }
                } else {
                    logDebug(`请求成功: ${data?.substring(0, 100)}...`)
                    resolve({ response, data })
                }
            }
            
            if (typeof $httpClient !== 'undefined') {
                $httpClient.post(requestOptions, handleResponse)
            } else if (typeof $task !== 'undefined') {
                requestOptions.method = "POST"
                $task.fetch(requestOptions).then(response => {
                    handleResponse(null, response, response.body)
                }, reason => handleResponse(reason.error, null, null))
            } else {
                reject(new Error("HTTP client not available"))
            }
        }
        
        attemptRequest(1)
    })
}

async function httpGet(options, retryCount = CONFIG.RETRY_COUNT) {
    return new Promise((resolve, reject) => {
        const attemptRequest = (attempt) => {
            logDebug(`HTTP请求尝试 ${attempt}/${CONFIG.RETRY_COUNT}: ${options.url}`)
            
            const requestOptions = {
                ...options,
                timeout: CONFIG.REQUEST_TIMEOUT
            }
            
            const handleResponse = (error, response, data) => {
                if (error) {
                    logError(`请求失败 (尝试 ${attempt})`, error)
                    if (attempt < retryCount) {
                        log(`等待 ${CONFIG.RETRY_DELAY}ms 后重试...`)
                        setTimeout(() => attemptRequest(attempt + 1), CONFIG.RETRY_DELAY)
                    } else {
                        reject(new Error(`请求失败，已重试 ${retryCount} 次: ${error}`))
                    }
                } else {
                    logDebug(`请求成功: ${data?.substring(0, 100)}...`)
                    resolve({ response, data })
                }
            }
            
            if (typeof $httpClient !== 'undefined') {
                $httpClient.get(requestOptions, handleResponse)
            } else if (typeof $task !== 'undefined') {
                requestOptions.method = "GET"
                $task.fetch(requestOptions).then(response => {
                    handleResponse(null, response, response.body)
                }, reason => handleResponse(reason.error, null, null))
            } else {
                reject(new Error("HTTP client not available"))
            }
        }
        
        attemptRequest(1)
    })
}

function isRequest() {
    return typeof $request !== "undefined"
}

function done(value = {}) {
    if (typeof $done !== 'undefined') {
        $done(value)
    }
}

// 创建请求头
function createHeaders(token, extraHeaders = {}) {
    const headers = {
        ...CONFIG.COMMON_HEADERS,
        ...extraHeaders,
        'lmtoken': token,
        'authorization': `Bearer ${token}`,
        'X-LF-UserToken': token,
        'token': token
    }
    
    // 添加存储的签名校验信息
    const storedSign = getVal(CONFIG.SIGN_KEY)
    const storedTimestamp = getVal(CONFIG.TIMESTAMP_KEY)
    const storedCookie = getVal(CONFIG.COOKIE_KEY)
    
    if (storedSign) headers['x-longzhu-sign'] = storedSign
    if (storedTimestamp) headers['x-longzhu-timestamp'] = storedTimestamp
    if (storedCookie) headers['cookie'] = storedCookie
    
    return headers
}

// 从请求中提取关键信息
function extractRequestInfo() {
    if (!isRequest()) return null
    
    const headers = $request.headers
    const token = headers["lmtoken"] || headers["Lmtoken"] || headers["LMToken"] || ""
    const sign = headers["x-longzhu-sign"] || ""
    const timestamp = headers["x-longzhu-timestamp"] || ""
    const cookie = headers["cookie"] || headers["Cookie"] || ""
    
    return { token, sign, timestamp, cookie }
}

// 获取并存储token和相关认证信息
function storeAuthInfo() {
    if (!isRequest()) return
    
    const info = extractRequestInfo()
    if (!info.token) {
        notify("获取token失败", "请检查请求header中是否包含lmtoken")
        logError("获取token失败", `所有header字段: ${JSON.stringify($request.headers)}`)
        return
    }
    
    // 存储token
    const currentToken = getVal(CONFIG.TOKEN_KEY)
    if (!currentToken) {
        setVal(CONFIG.TOKEN_KEY, info.token)
        notify("首次获取token成功", `token: ${sanitizeToken(info.token)}`)
        log(`首次获取token成功: ${info.token}`)
    } else if (currentToken !== info.token) {
        setVal(CONFIG.TOKEN_KEY, info.token)
        notify("token已更新", `新token: ${sanitizeToken(info.token)}`)
        log(`token已更新: ${info.token}`)
    } else {
        logDebug(`token未变化: ${sanitizeToken(info.token)}`)
    }
    
    // 存储sign和timestamp
    if (info.sign) {
        setVal(CONFIG.SIGN_KEY, info.sign)
        logDebug(`存储sign: ${info.sign}`)
    }
    if (info.timestamp) {
        setVal(CONFIG.TIMESTAMP_KEY, info.timestamp)
        logDebug(`存储timestamp: ${info.timestamp}`)
    }
    if (info.cookie) {
        setVal(CONFIG.COOKIE_KEY, info.cookie)
        logDebug(`存储cookie: ${info.cookie}`)
    }
}

// 主要功能函数
async function doLotteryCheckIn() {
    const token = getVal(CONFIG.TOKEN_KEY)
    if (!validateToken(token)) {
        notify("抽奖签到失败", "请先打开龙湖APP登录获取token")
        log("抽奖签到失败: token无效")
        done()
        return
    }

    log(`开始执行抽奖签到，token: ${sanitizeToken(token)}`)

    try {
        const headers = createHeaders(token, {
            'Origin': 'https://llt.longfor.com',
            'Referer': 'https://llt.longfor.com/',
            'X-LF-DXRisk-Source': '2',
            'X-LF-DXRisk-Token': '686808d2zGtwOykELsEwuul5epDPUIFcSTYY0Xr1',
            'bucode': 'L00602',
            'channel': 'L0',
            'x-gaia-api-key': '2f9e3889-91d9-4684-8ff5-24d881438eaf'
        })

        const signInBody = {
            "component_no": CONFIG.ACTIVITY.LOTTERY_COMPONENT,
            "activity_no": CONFIG.ACTIVITY.LOTTERY_ACTIVITY
        }

        const signInOptions = {
            url: CONFIG.API.LOTTERY_SIGN,
            headers: headers,
            body: JSON.stringify(signInBody)
        }

        log("开始执行抽奖活动签到...")
        const signInResult = await httpPost(signInOptions)
        const signInData = JSON.parse(signInResult.data)

        if (signInData.code === "0000") {
            log("抽奖活动签到成功，开始执行抽奖...")
            await performLottery(headers)
        } else if (signInData.code === "863036") {
            log("今日已签到，直接执行抽奖...")
            await performLottery(headers)
        } else {
            notify("抽奖签到异常", `签到返回码: ${signInData.code}, 消息: ${signInData.message || '未知错误'}`)
            log(`抽奖签到返回异常: ${signInResult.data}`)
            done()
        }
    } catch (error) {
        notify("抽奖签到失败", `签到请求失败: ${error.message}`)
        logError("抽奖签到失败", error)
        done()
    }
}

async function performLottery(headers) {
    const lotteryBody = {
        "component_no": CONFIG.ACTIVITY.LOTTERY_COMPONENT,
        "activity_no": CONFIG.ACTIVITY.LOTTERY_ACTIVITY,
        "batch_no": ""
    }

    const lotteryOptions = {
        url: CONFIG.API.LOTTERY_DRAW,
        headers: headers,
        body: JSON.stringify(lotteryBody)
    }

    try {
        log("开始执行抽奖...")
        const lotteryResult = await httpPost(lotteryOptions)
        const lotteryData = JSON.parse(lotteryResult.data)

        if (lotteryData.code === "0000") {
            const prize = lotteryData.data?.prize_name || "未知奖品"
            notify("抽奖成功", `恭喜获得: ${prize}`, "bell")
            log(`抽奖成功，获得奖品: ${prize}`)
        } else if (lotteryData.code === "863033") {
            notify("抽奖提醒", "今日已抽奖，明天再来吧")
            log("今日已抽奖")
        } else {
            notify("抽奖异常", `返回码: ${lotteryData.code}, 消息: ${lotteryData.message || '未知错误'}`)
            log(`抽奖返回异常: ${lotteryResult.data}`)
        }
    } catch (error) {
        notify("抽奖失败", `抽奖请求失败: ${error.message}`)
        logError("抽奖失败", error)
    }
    done()
}

// 执行签到
async function doSignIn() {
    const token = getVal(CONFIG.TOKEN_KEY)
    if (!validateToken(token)) {
        notify("签到失败", "请先打开龙湖APP登录获取token")
        log("签到失败: token无效")
        return false
    }

    log(`开始执行签到，token: ${sanitizeToken(token)}`)

    try {
        const headers = createHeaders(token, {
            'Content-Type': 'application/json;charset=UTF-8',
            'Origin': 'https://longzhu.longfor.com',
            'Referer': 'https://longzhu.longfor.com/',
            'X-GAIA-API-KEY': 'c06753f1-3e68-437d-b592-b94656ea5517',
            'X-LF-Bu-Code': 'L00602',
            'X-LF-Channel': 'L0',
            'X-LF-DXRisk-Captcha-Token': 'undefined',
            'X-LF-DXRisk-Source': '2',
            'X-LF-DXRisk-Token': '68673780TZSEnm6nueRfRAziVGwXc5NyaH5z5vo1'
        })

        const options = {
            url: CONFIG.API.SIGN_IN,
            headers: headers,
            body: JSON.stringify({"activity_no": CONFIG.ACTIVITY.SIGN_IN_NO})
        }

        const result = await httpPost(options)
        const data = JSON.parse(result.data)
        
        if (data.code === 200 || data.code === "0000") {
            notify("签到成功", `签到完成: ${data.message || '获得积分'}`)
            log(`签到成功: ${result.data}`)
            return true
        } else {
            notify("签到异常", `返回码: ${data.code}, 消息: ${data.message || '未知错误'}`)
            log(`签到返回异常: ${result.data}`)
            return false
        }
    } catch (error) {
        notify("签到失败", `请求失败: ${error.message}`)
        logError("签到失败", error)
        return false
    }
}

// 主执行逻辑
if (isRequest()) {
    // 请求阶段：获取token及相关认证信息
    storeAuthInfo()
    done()
} else {
    // 定时任务阶段：执行签到和抽奖
    (async () => {
        try {
            const token = getVal(CONFIG.TOKEN_KEY)
            if (!validateToken(token)) {
                notify("请先获取token", "请打开龙湖APP登录")
                log("请先打开龙湖APP登录获取token")
                done()
                return
            }

            log(`开始执行签到和抽奖，token: ${sanitizeToken(token)}`)

            // 先执行常规签到
            const signInSuccess = await doSignIn()
            
            if (signInSuccess) {
                log("常规签到完成，等待1秒后开始执行抽奖签到...")
                await sleep(1000)
            } else {
                log("常规签到失败，但仍尝试执行抽奖签到...")
                await sleep(1000)
            }
            
            // 执行抽奖签到和抽奖
            await doLotteryCheckIn()
            
        } catch (error) {
            notify("执行失败", `脚本执行出错: ${error.message}`)
            logError("脚本执行失败", error)
            done()
        }
    })()
}
