// ==UserScript==
// @name         laplace自动读弹幕
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://chat.laplace.live/dashboard/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=laplace.live
// @grant        none
// ==/UserScript==
// todo: 貌似浏览器现在默认不让网页自动play audio，查一查怎么向用户申请权限

(function() {
    'use strict';
    // 惰性单例，虽然完全没必要搞这么复杂，作为一个外行人权当学习了一波罢了
    const getSpeecherInstance = (function() {
        const TYPE = {
            UTTER: "type_utter",
            DELAY: "type_delay"
        };

        class Speecher {
            static get SPEECH_TYPE() {
                return TYPE;
            }

            #speechQueue = [];

            #speechFront() {
                if (this.#speechQueue.length == 0) return;
                const front = this.#speechQueue[0];
                const onFinish = () => this.#speechNext();
                switch (front.type) {
                    case Speecher.SPEECH_TYPE.UTTER: {
                        const utter = new SpeechSynthesisUtterance(front.text);
                        utter.rate = front.rate;
                        utter.volume = front.volume;
                        utter.pitch = front.pitch;
                        utter.voice = front.voice;
                        utter.lang = front.lang;
                        utter.onend = onFinish;
                        utter.onerror = event => {
                            console.error(event);
                            onFinish();
                        }
                        speechSynthesis.speak(utter);
                        break;
                    }
                    case Speecher.SPEECH_TYPE.DELAY:
                        front.timeoutId = setTimeout(onFinish, front.delay * 1000);
                        break;
                    default:
                        console.log(`unhandled speech type:${front.type}`);
                        onFinish();
                }
            }
            #speechNext() {
                this.#speechQueue.shift();
                this.#speechFront();
            }
            #push2Queue(sp) {
                this.#speechQueue.push(sp);
                if (this.#speechQueue.length == 1) {
                    this.#speechFront();
                }
            }

            // SpeechSynthesisUtterance还有好几个参数，比如volume、pitch、voice、lang，其实也挺有用的，但是我用不到
            pushUtter(text, rate = 1, volume = 1, pitch = 1, voice = null, lang = "") {
                this.#push2Queue({
                    type: Speecher.SPEECH_TYPE.UTTER,
                    text: text,
                    rate: rate,
                    volume: volume,
                    pitch: pitch,
                    voice: voice,
                    lang: lang
                });
            };
            pushDelay(delayTime = 0) {
                this.#push2Queue({
                    type: Speecher.SPEECH_TYPE.DELAY,
                    delay: delayTime
                });
            };
            cancel() {
                if (this.#speechQueue.length == 0) return;
                const front = this.#speechQueue[0];
                if (front.timeoutId) {
                    clearTimeout(front.timeoutId);
                }
                // speechSynthesis.cancel实际上会触发SpeechSynthesisUtterance.onerror，onerror会调用speechNext，所以必须先清空speechQueue
                // 也可以考虑改下onerror，判断如果是cancel引发的error的话，就不调用speechNext；但是无论如何都是要清空speechQueue的，所以就这样吧
                this.#speechQueue = [];
                speechSynthesis.cancel();
            };
        }

        let _instance = null;
        return function() {
            if (!_instance) {
                _instance = new Speecher();
            }
            return _instance;
        }
    })();
    const speecher = getSpeecherInstance();

    function onNewMsg(username, msg) {
        // 自定义消息的配置
        const WORD_SAY = "说";
        const CANCEL_ON_NEW_MSG = true;
        const DELAY_BETWEEN_USERNAME_AND_MSG = 0.2;
        if (CANCEL_ON_NEW_MSG) {
            speecher.cancel();
        }
        speecher.pushUtter(`${username}${WORD_SAY}`);
        speecher.pushDelay(DELAY_BETWEEN_USERNAME_AND_MSG);
        speecher.pushUtter(msg);
    }

    // node插入dom后，解析node来获取信息，并触发相应回调
    // 目前只处理了弹幕消息回调，可以考虑新增用户进入直播间回调、礼物回调等
    const handledMsg = new Map();
    function parseNodeInfo(node) {
        // 滚动层铺满之后再拖动，使得视野外的弹幕重新可见时，貌似会触发mutation，估计是弹幕移动到视野外的时候会被remove掉，回到视野内时重新add进来。需要记录下以防止重复处理
        const dataset = node.dataset;
        if (!dataset.uid || !dataset.timestamp) return; // 保险，毕竟没有源码
        const uniqueId = `${dataset.uid}_${dataset.timestamp}`;
        if (handledMsg.get(uniqueId)) return;
        handledMsg.set(uniqueId, true);

        try {
            const classList = node.classList;
            if (classList.contains("event-type--message")) {
                const username = node.querySelector("span.username").innerText;
                const msg = node.querySelector("span.message").innerText;
                onNewMsg(username, msg);
            } else if (classList.contains("event-type--gift")) {
            } else if (classList.contains("event-type--toast")) {
            } else if (classList.contains("event-type--superchat")) {
            } else if (classList.contains("event-type--system")) {
            }
        } catch (error) {
            console.error(error);
        }
    }

    // 由于没有api，只能通过监听node插入dom事件来获取弹幕事件
    function observeScrollPanel() {
        const config = { childList: true };
        const callback = function(mutationsList) {
            mutationsList.forEach(mutation => {
                mutation.addedNodes.forEach(parseNodeInfo);
            });
        };
        const observer = new MutationObserver(callback);
        const scrollDivList = document.querySelectorAll(".mantine-ScrollArea-viewport > div");
        scrollDivList.forEach(scrollDiv => observer.observe(scrollDiv, config));
        // observer.disconnect();
    }
    observeScrollPanel();
})();
