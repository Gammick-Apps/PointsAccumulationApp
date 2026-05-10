
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
    return { "date": getYesterdayDate(), "numPosition": "", "hasPrint": "1", "hasBuy": "0", "device": "0", "color": "0", "type": "0", "hasParents": "0", "hasTests": "0", "timer": "10", "buy": false, "textColor":0 };
}

function login(page) {
    window.location.href = page + '.html';
}

function getBackgroundUrl() {
     fileName = 'personalBackground';
                window.expose.SendImage("getBackground", fileName);
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
    switch (color) {
        case "0":
            return "#ffffff";
        case "1":
            return "#000000";
        case "2":
            return "#00eac8";
    }
}

function getExcelFiles() {
    return ["students", "uniqTasks", "products", "parents", "tests"];
}

function getWonTexts() {
    return ["!איזה כיף", "---כן, כן, זה קרה", "...וואו, איזה חלום", "---קולולולולו"];
}

function getLossTexts() {
    return ["...לא זכית, אוי לא", "!!חבל--- לא זכית הפעם", "!אופס... הכרטיס לא שווה ", "...לא זכית! לא נורא"];
}