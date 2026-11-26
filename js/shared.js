
function getYesterdayDate() {
    var x = new Date();
    x.setDate((new Date().getDate() - 1))
    return x.toISOString().split('T')[0];
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function getTodayDateTime() {
    return new Date().toLocaleString();
}

function getDefaultConfig() {
    return { "date": getYesterdayDate(), "numPosition": "", "hasPrint": "1", "hasBuy": "0", "device": "0", "color": "0", "type": "0", "hasParents": "0", "hasTests": "0", "timer": "10", "buy": false, "textColor": "#ffffff", "prizeChance": 0, "language": "he" };
}

function login(page) {
    window.location.href = page + '.html';
}

function getBackgroundUrl() {
     fileName = 'personalBackground';
                window.expose.sendImage("getBackground", fileName);
                window.expose.receive("receiveGetBackground" + fileName, (data) => {
                    if (data && data != 0) {
                        document.getElementById("background").style.backgroundImage = 'url("data:' + data.mimeType + ';base64,' + data.data + '")';
                    }
                });
}

function getBackground(device, color, step = "") {
    switch (device) {
        case "0": {
            return "url('../../resources/barcode/pinkBackground" + step + ".gif')";
        };
        case "1": {
            switch (color) {
                case "1":
                    return "url('../../resources/barcode/pinkBackground" + step + ".gif')";
                case "2":
                    return "url('../../resources/barcode/greenBackground" + step + ".gif')";
                case "3":
                    return "url('../../resources/barcode/ravKavBackground.png')";
                case "4":                                      
                    return getBackgroundUrl();
                case "5":
                    return "url('../../resources/gammick/gammickBackground.png')";
            }
        };
        case "2":
        case "4":
        case "6":
            {
                switch (color) {
                    case "1":
                        return "url('../../resources/magnetCard/background.png')";
                    case "3":
                        return "url('../../resources/magnetCard/ravKavBackground.png')";
                    case "4":
                        return getBackgroundUrl();
                     case "5":
                        return "url('../../resources/gammick/gammickBackground.png')";
                };
            };
        case "3":{     
                return "url('../../resources/digitalCard/background" + step + ".gif')";
        };
        case "5": {
            switch (color) {
                case "4":
                    return getBackgroundUrl();
                case "5":
                    return "url('../../resources/gammick/gammickBackground.png')";
            }
        };
    }
}

// מסכי ההפעלה היומית: רקע אישי או רקע Gammick מחליפים את רקע הכוכבים (#stars)
function applyDailyBackground(systemConfig) {
    const bg = getBackground(systemConfig.device, systemConfig.color);
    if (systemConfig.color == "4" || bg) {
        document.getElementById("stars").style.display = "none";
        if (bg) document.getElementById("background").style.backgroundImage = bg;
    }
}

function getPosition(color) {
    switch (color) {
        case "1":
            return ["#75DDB4","#ffffff"];
        case "2":
            return ["#f7ff66","#ffffff"];
        case "3":
        case "4":
            return ["#ffffff","#000000"];
        case "5":
            return ["#ffffff","#00eac8"];
        case "6":
            return ["#ffffff","#1a1050"];
        default:
            return ["#ffffff","#000000"];
    }
}

function getTextColor(color) {
    // Hex color from the color picker; fallback to white if missing/invalid
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ffffff";
}

// ערכי tasks.multiple ו-products.multiple.
// המשמעות ממומשת ב-hasStudentDoneSelected, ולכן הרשימה חיה בקוד ולא במסד:
// ערך רביעי בטבלה לא היה יודע להתנהג.
// ההודעה כשהבת כבר תיקפה/קנתה, לפי סוג ההגבלה. messages: { ever, daily, singleUse }
function alreadyDoneMessageKey(multiple, messages) {
    const value = Number(multiple);
    if (value === 2) {
        return messages.daily;
    }
    if (value === 3 && messages.singleUse) {
        return messages.singleUse;
    }
    return messages.ever;
}

// 3 (חד-פעמית לכל המוסד) קיים רק במשימות, ולכן נוסף רק כשמבקשים
function getMultipleLabels(withSingleUse = false) {
    const labels = {
        0: 'פעם אחת בלבד',
        1: 'ללא הגבלה',
        2: 'פעם ביום'
    };
    if (withSingleUse) {
        labels[3] = 'חד-פעמית (לכל המוסד)';
    }
    return labels;
}

function getExcelFiles() {
    return ["students", "tasks", "products", "tests", "questions"];
}




var confettiAnimationId = null;

// מקבל מזהה קנבס; אם הקנבס יושב בתוך מיכל, הקונפטי נצבע לפי גודל המיכל
// ולא לפי החלון, כדי שאפשר יהיה להריץ אותו בתוך פופאפ
function launchConfetti(duration = 5000, canvasId = "confettiCanvas") {
    let canvas = document.getElementById(canvasId);
    if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.id = canvasId;
        canvas.className = "confetti-canvas";
        document.body.appendChild(canvas);
    }

    const host = canvas.parentElement && canvas.parentElement !== document.body
        ? canvas.parentElement
        : null;

    canvas.width = host ? host.clientWidth : window.innerWidth;
    canvas.height = host ? host.clientHeight : window.innerHeight;

    if (canvas.width === 0 || canvas.height === 0) {
        return;
    }

    const ctx = canvas.getContext("2d");
    const colors = ['#FFC700', '#FF3D68', '#3D9BFF', '#3DFFA0', '#B14EFF', '#FF8A3D'];
    const scale = Math.min(1, canvas.width / window.innerWidth);
    const count = Math.max(50, Math.round(160 * scale));
    const particles = [];

    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * canvas.height * 0.5,
            size: (14 + Math.random() * 12) * Math.max(0.55, scale),
            color: colors[Math.floor(Math.random() * colors.length)],
            speedY: 2 + Math.random() * 3,
            speedX: (Math.random() - 0.5) * 2,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }

    const startTime = performance.now();

    function frame(now) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.rotation += p.rotationSpeed;
            // בתוך פופאפ הפתיתים ממשיכים ליפול במחזוריות, אחרת הוא מתרוקן מהר
            if (host && p.y > canvas.height + p.size) {
                p.y = -p.size;
                p.x = Math.random() * canvas.width;
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
            ctx.restore();
        });
        if (now - startTime < duration) {
            confettiAnimationId = requestAnimationFrame(frame);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = requestAnimationFrame(frame);
}

// כפתור "ניהול קבלות" בממשקי הניהול: הפעלה/כיבוי של הדפסת קבלה,
// ומחיקת כל הקבלות שמחכות בתור המדפסת עם פס חיווי.
// withPrintSwitch - רק במסכים שבהם ההדפסה תלויה בהגדרה (ברקוד/מגנטי/צ'יפים/טביעת אצבע)
var receiptsManagerListening = false;

function openReceiptsManager(withPrintSwitch = false) {
    let modalEl = document.getElementById("receiptsModal");
    if (!modalEl) {
        document.body.insertAdjacentHTML("beforeend", `
            <div class="modal fade" id="receiptsModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered" role="document">
                    <div class="modal-content" style="direction: rtl; text-align: right;">
                        <div class="modal-header">
                            <h5 class="modal-title">ניהול קבלות</h5>
                        </div>
                        <div class="modal-body">
                            <div id="receiptsPrintSec">
                                <div class="form-check form-switch d-flex align-items-center gap-2 ps-0">
                                    <input class="form-check-input m-0" type="checkbox" role="switch" id="receiptsPrintSwitch"
                                        onchange="receiptsPrintChange()">
                                    <label class="form-check-label" for="receiptsPrintSwitch" id="receiptsPrintLabel"></label>
                                </div>
                                <hr>
                            </div>
                            <div>קבלות שמחכות בתור המדפסת (למשל כשהמדפסת מנותקת) יודפסו כולן כשהיא תחובר.</div>
                            <button type="button" class="btn btn-danger mt-3" id="receiptsClearBtn" onclick="clearReceiptsQueue()">מחיקת קבלות מהתור</button>
                            <div id="receiptsProgressSec" style="display: none;">
                                <div id="receiptsClearText" class="mt-3"></div>
                                <div class="progress mt-2" style="height: 22px; direction: ltr;">
                                    <div id="receiptsClearBar" class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%;"></div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="receiptsCloseBtn" data-bs-dismiss="modal">סגור</button>
                        </div>
                    </div>
                </div>
            </div>`);
        modalEl = document.getElementById("receiptsModal");
    }

    document.getElementById("receiptsPrintSec").style.display = withPrintSwitch ? "" : "none";
    if (withPrintSwitch) {
        document.getElementById("receiptsPrintSwitch").checked = systemConfig.hasPrint == "1";
        showReceiptsPrintLabel();
    }
    document.getElementById("receiptsProgressSec").style.display = "none";
    document.getElementById("receiptsClearBtn").disabled = false;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function showReceiptsPrintLabel() {
    document.getElementById("receiptsPrintLabel").innerHTML =
        document.getElementById("receiptsPrintSwitch").checked ? 'הדפסת קבלה פעילה' : 'הדפסת קבלה לא פעילה';
}

function receiptsPrintChange() {
    systemConfig.hasPrint = document.getElementById("receiptsPrintSwitch").checked ? "1" : "0";
    showReceiptsPrintLabel();
    window.expose.sendSystem("sendUpdateSystem", JSON.stringify(systemConfig));
}

function clearReceiptsQueue() {
    const bar = document.getElementById("receiptsClearBar");
    document.getElementById("receiptsProgressSec").style.display = "";
    document.getElementById("receiptsClearText").innerHTML = "בודק את תור ההדפסה...";
    bar.style.width = "0%";
    bar.classList.add("progress-bar-animated");
    document.getElementById("receiptsClearBtn").disabled = true;
    document.getElementById("receiptsCloseBtn").disabled = true;

    // מאזין אחד בלבד, אחרת כל לחיצה נוספת מוסיפה מאזין שנורה שוב
    if (!receiptsManagerListening) {
        receiptsManagerListening = true;
        window.expose.receive("receiveClearReceiptsProgress", ({ done, total }) => {
            document.getElementById("receiptsClearText").innerHTML = `נמחקו ${done} מתוך ${total} קבלות`;
            document.getElementById("receiptsClearBar").style.width = (total ? Math.round(done / total * 100) : 100) + "%";
        });
        window.expose.receive("receiveClearReceipts", ({ ok, total }) => {
            const barEl = document.getElementById("receiptsClearBar");
            barEl.style.width = "100%";
            barEl.classList.remove("progress-bar-animated");
            document.getElementById("receiptsClearText").innerHTML = !ok
                ? "לא הצלחנו לגשת לתור ההדפסה."
                : total === 0 ? "אין קבלות שמחכות בתור." : `נמחקו ${total} קבלות מהתור.`;
            document.getElementById("receiptsClearBtn").disabled = false;
            document.getElementById("receiptsCloseBtn").disabled = false;
        });
    }

    window.expose.send("sendClearReceipts");
}
