/**
 * 龙湖APP自动签到脚本 - 优化版
 *
 * 功能：
 * 1. 自动完成龙湖APP每日签到，获取积分
 * 2. 自动完成抽奖活动签到和抽奖
 * 兼容：Shadowrocket, Surge, Quantumult X, Loon
 * 
 * 优化内容：
 * - 配置管理系统
 * - 改进错误处理和重试机制
 * - 优化日志系统
 * - 代码结构重构
 */

// 配置常量
const CONFIG = {
    SCRIPT_NAME: '龙湖签到',
    TOKEN_KEY: 'longfor_token',
    DEBUG_MODE: false,
    RETRY_COUNT: 3,
    RETRY_DELAY: 2000,
    REQUEST_TIMEOUT: 10000,
    
    // API 配置
    API: {
        SIGN_IN: "https://gw2c-hw-open.longfor.com/lmarketing-task-api-mvc-prod/openapi/task/v1/signature/clock",
        LOTTERY_SIGN: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/sign",
        LOTTERY_DRAW: "https://gw2c-hw-open.longfor.com/llt-gateway-prod/api/v1/activity/auth/lottery/click"
    },
    
    // 活动配置（易于更新）
    ACTIVITY: {
        SIGN_IN_NO: "11111111111736501868255956070000",
        LOTTERY_COMPONENT: "CO15400F29R2ZFJZ",
        LOTTERY_ACTIVITY: "AP25K062Q6YYQ7FX"
    },
    
    // 通用请求头（基于最新抓包信息更新）
    COMMON_HEADERS: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip,compress,br,deflate',
        'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
        'Content-Type': 'application/json',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.52(0x18003426) NetType/4G Language/zh_HK',
        'X-LF-App-Version': '1.19.0',
        'X-LF-Api-Version': 'v1_19_0',
        'X-LF-Channel': 'C2',
        'X-LF-Bucode': 'C20400'
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

// 生成随机RequestId
function generateRequestId() {
    return `${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 12).toUpperCase()}`
}

// HTTP请求函数（带重试机制）
async function httpPost(options, retryCount = CONFIG.RETRY_COUNT) {
    return new Promise((resolve, reject) => {
        const attemptRequest = (attempt) => {
            logDebug(`HTTP请求尝试 ${attempt}/${CONFIG.RETRY_COUNT}: ${options.url}`)
            
            // 补充时间戳和RequestId
            const timestamp = Date.now()
            const requestId = generateRequestId()
            const headers = {
                ...options.headers,
                'X-LONGZHU-TimeStamp': timestamp,
                'X-LF-RequestId': requestId
            }
            
            const requestOptions = {
                ...options,
                headers: headers,
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

function isRequest() {
    return typeof $request !== "undefined"
}

function isMatch(reg) {
    return !!($request && $request.method !== 'OPTIONS' && $request.url.match(reg))
}

function done(value = {}) {
    if (typeof $done !== 'undefined') {
        $done(value)
    }
}

// 创建请求头
function createHeaders(token, extraHeaders = {}) {
    return {
        ...CONFIG.COMMON_HEADERS,
        ...extraHeaders,
        'authtoken': token,
        'X-LF-UserToken': token,
        'token': token,
        'lmToken': token // 新增lmToken头（抓包中存在）
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
            'Cookie': 'acw_tc=ac11000117623071329245637e41be1f91d1a6c795a298535cc7942e91e9b5',
            'Origin': 'https://llt.longfor.com',
            'Referer': 'https://servicewechat.com/wx50282644351869da/473/page-frame.html',
            'X-LF-DXRisk-Source': '2',
            'x-gaia-api-key': '2f9e3889-91d9-4684-8ff5-24d881438eaf',
            'X-Client-Type': 'microApp' // 新增客户端类型
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

function getToken() {
    // 更新token匹配的接口路径（基于最新抓包的v1_19_0版本）
    if (isMatch(/\/supera\/mine\/v1_19_0\/message\/findUnreadCount/)) {
        log('开始获取token')
        
        try {
            const headers = $request.headers
            // 从lmToken头获取token（抓包中使用的是lmToken）
            const token = headers["lmToken"] || headers["lmtoken"] || headers["LMTOKEN"] || ""

            if (!token) {
                notify("获取token失败", "请检查请求header中是否包含lmToken")
                logError("获取token失败", `所有header字段: ${JSON.stringify(headers)}`)
                return
            }

            const currentToken = getVal(CONFIG.TOKEN_KEY)
            if (!currentToken) {
                setVal(CONFIG.TOKEN_KEY, token)
                notify("首次获取token成功", `token: ${sanitizeToken(token)}`)
                log(`首次获取token成功: ${token}`)
            } else if (currentToken !== token) {
                setVal(CONFIG.TOKEN_KEY, token)
                notify("token已更新", `新token: ${sanitizeToken(token)}`)
                log(`token已更新: ${token}`)
            } else {
                logDebug(`token未变化: ${sanitizeToken(token)}`)
            }
        } catch (error) {
            notify("获取token失败", `处理token时出错: ${error.message}`)
            logError("获取token失败", error)
        }
    }
}

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
            'Cookie': 'acw_tc=ac11000117623071329245637e41be1f91d1a6c795a298535cc7942e91e9b5',
            'Origin': 'https://longzhu.longfor.com',
            'Referer': 'https://servicewechat.com/wx50282644351869da/473/page-frame.html',
            'X-GAIA-API-KEY': 'c06753f1-3e68-437d-b592-b94656ea5517',
            'X-LF-DXRisk-Captcha-Token': 'undefined',
            'X-LF-DXRisk-Source': '2',
            'X-Client-Type': 'microApp' // 新增客户端类型
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
    // 请求阶段：获取token
    getToken()
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
