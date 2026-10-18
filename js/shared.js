
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
    return { "date": getYesterdayDate(), "numPosition": "", "hasPrint": "1", "hasBuy": "0", "device": "0", "color": "0", "type": "0", "hasParents": "0", "hasTests": "0", "timer": "10", "buy": false, "textColor": "#ffffff", "prizeChance": 0 };
}

function login(page) {
    window.location.href = page + '.html';
}

function getBackgroundUrl() {
     fileName = 'personalBackground';
                window.expose.sendImage("getBackground", fileName);
                window.expose.receive("receiveGetBackground" + fileName, (data) => {
                    if (data && data != 0) {
                        document.getElementById("background").style.backgroundImage = 'url("data:image/png;base64,' + data + '")';
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
    }
}

function getTextColor(color) {
    // Hex color from the color picker; fallback to white if missing/invalid
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ffffff";
}

function getExcelFiles() {
    return ["students", "tasks", "products", "tests", "questions"];
}

function getWonTexts() {
    return ["!איזה כיף", "---כן, כן, זה קרה", "...וואו, איזה חלום", "---קולולולולו"];
}

function getLossTexts() {
    return ["...לא זכית, אוי לא", "!!חבל--- לא זכית הפעם", "!אופס... הכרטיס לא שווה ", "...לא זכית! לא נורא"];
}

// מחמאה אקראית לקבלה המודפסת; נכתבות בכיוון רגיל כי ה-div בקבלה מוגדר rtl
function getRandomCompliment() {
    const compliments = [
        "אחת כמוך צריכים פעמיים",
        "אין כמוך ואין עלייך, מה היינו עושים בלעדייך?",
        "נדירה!",
        "אפילו את לא יודעת כמה את מיוחדת!",
        "יש מצב לשכפל אותך?",
        "את שווה מליונים! תזכרי שאנחנו עלינו על זה ראשונים!",
        "כבר אמרנו לך שאין כמוך?",
        "כמה הספקת היום! הלוואי על כולם",
        "רבות בנות עשו חיל - ואת עלית!",
        "את מיוחדת במיוחד!",
        "תמשיכי לנסוק אלעל",
        "עוד תגיעי רחוק---",
        "את חלום של כל אמא!",
        "עוצמה של גננת!",
        "בשבילנו את תמיד במחלקה ראשונה!",
        "תמשיכי לטוס ולהרגיש בעננים!",
        "אם לא את- לא היה!",
        "אין גננת טובה - יש גננת שטוב לה!",
        "לך- מגיע מטוס פרטי!",
        "המשך טיסה נעימה"
    ];
    return compliments[Math.floor(Math.random() * compliments.length)];
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
