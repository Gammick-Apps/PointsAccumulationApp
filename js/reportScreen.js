// מסך משותף למשימות ולמתנות: מימין הרשימה לעריכה (כמו שהייתה בממשק הניהול),
// משמאל התיעוד לפי בת. "הצגה" בשורה מסננת את התיעוד לפיה, לחיצה נוספת מבטלת.
function initReportScreen(cfg) {
    var systemConfig = "";
    var searchVal = "";
    var listApi = null;
    var recordsApi = null;
    var selected = null;
    const MULTIPLE_LABELS = getMultipleLabels();

    window.expose.sendSystem("sendReadSystem", 'systemConfig');
    window.expose.receiveSystem("receiveReadSystem" + 'systemConfig', (data) => {
        systemConfig = (!data || Object.keys(data).length == 0) ? getDefaultConfig() : data;
        document.getElementById("background").style.backgroundImage =
            getBackground(systemConfig.device, systemConfig.color);
        document.querySelectorAll(".prizes-title").forEach(el =>
            el.style.color = getTextColor(systemConfig.textColor));
    });

    window.expose.receiveDbData(cfg.listReceive, showList);
    window.expose.receiveDbData(cfg.recordsReceive, showRecords);
    window.expose.sendDbData(cfg.listSend);
    window.expose.sendDbData(cfg.recordsSend);

    // ------- הרשימה (משימות / מתנות) ------- //

    // אלמנט DOM אמיתי ולא מחרוזת, כדי שאפשר יהיה לחבר onchange בלי עורך תא
    function multipleSelectRenderer(params) {
        const select = document.createElement('select');
        select.className = 'form-select form-select-sm';
        Object.keys(MULTIPLE_LABELS).forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = MULTIPLE_LABELS[value];
            select.appendChild(option);
        });
        select.value = String(Number(params.value) || 0);
        select.addEventListener('change', function () {
            params.data.multiple = Number(select.value);
            saveField(params.data, 'multiple', params.data.multiple);
        });
        return select;
    }

    function showRecordsRenderer(params) {
        const isSelected = selected !== null && selected.id === params.data.id;
        return '<span class="report-show-link">' + (isSelected ? 'הצג הכל' : 'הצגה') + '</span>';
    }

    var listColumns = [
        { checkboxSelection: true, width: 50, maxWidth: 50 },
        { headerName: "קוד", field: "code", editable: false, flex: 1 },
        { headerName: "שם", field: "name", editable: true, flex: 2 },
        { headerName: "נקודות", field: "points", editable: true, flex: 1 },
        {
            headerName: "הגבלת תיקוף", field: "multiple", editable: false, flex: 2,
            cellStyle: { textAlign: 'center' }, cellRenderer: multipleSelectRenderer
        },
        { headerName: cfg.countHeader, field: cfg.countField, editable: false, flex: 1, minWidth: 110 },
        {
            headerName: cfg.recordsTitle, field: "showRecords", editable: false, sortable: false, flex: 1,
            cellStyle: { textAlign: 'center' }, cellRenderer: showRecordsRenderer
        }
    ];

    function showList(data) {
        if (!Array.isArray(data)) {
            return;
        }
        if (cfg.onListData) {
            cfg.onListData(data);
        }
        if (listApi) {
            listApi.setRowData(data);
            markShown();
            return;
        }
        const options = {
            columnDefs: listColumns,
            rowData: data,
            enableRtl: true,
            rowSelection: 'multiple',
            suppressRowClickSelection: true,
            defaultColDef: { sortable: true, resizable: true },
            onCellEditingStopped: (event) => saveField(event.data, event.colDef.field, event.newValue),
            onRowSelected: onRowSelected,
            onCellClicked: onListCellClicked,
            onFirstDataRendered: markShown
        };
        new agGrid.Grid(document.querySelector('#listGrid'), options);
        listApi = options.api;
    }

    function markShown() {
        listApi.forEachNode(node => node.setSelected(node.data.show == true));
    }

    // האירוע מגיע גם מהסימון הראשוני (ובאיחור), ולכן שומרים רק כשהערך באמת השתנה
    function onRowSelected(event) {
        const show = event.node.isSelected() ? 1 : 0;
        if (Number(event.node.data.show) === show) {
            return;
        }
        event.node.data.show = show;
        saveField(event.node.data, 'show', show);
    }

    function saveField(row, field, value) {
        window.expose.sendDbData(cfg.updateSend, JSON.stringify({ code: row.code, field: field, value: value }));
    }

    function onListCellClicked(event) {
        if (event.colDef.field !== 'showRecords') {
            return;
        }
        selected = (selected !== null && selected.id === event.data.id) ? null : event.data;
        document.getElementById("recordsTitle").innerText =
            selected ? cfg.recordsTitle + ' - ' + selected.name : cfg.recordsTitle;
        listApi.refreshCells({ columns: ['showRecords'], force: true });
        applyFilter();
    }

    function addItem() {
        window.expose.sendDbData(cfg.insertSend);
        window.expose.receiveDbData(cfg.insertReceive, (data) => {
            if (data === true) {
                location.reload();
            }
        });
    }

    function reloadList() {
        window.expose.sendDbData(cfg.listSend);
    }

    // ------- התיעוד לפי בת ------- //

    function showRecords(data) {
        if (!Array.isArray(data)) {
            return;
        }
        const options = {
            columnDefs: cfg.recordsColumns,
            rowData: data,
            enableRtl: true,
            defaultColDef: { sortable: true, resizable: true },
            isExternalFilterPresent: () => selected !== null || studentSearch() !== "",
            doesExternalFilterPass: doesRecordPass,
            onModelUpdated: updateCount
        };
        new agGrid.Grid(document.querySelector('#recordsGrid'), options);
        recordsApi = options.api;
        updateCount();
    }

    function studentSearch() {
        return document.getElementById("studentFilter").value.trim();
    }

    function doesRecordPass(node) {
        if (selected !== null && node.data[cfg.recordsKey] !== selected.id) {
            return false;
        }
        const student = studentSearch();
        return student === "" || String(node.data.studentName).includes(student);
    }

    function applyFilter() {
        if (recordsApi) {
            recordsApi.onFilterChanged();
        }
    }

    function updateCount() {
        if (recordsApi) {
            document.getElementById("recordsCount").innerText = 'סה"כ: ' + recordsApi.getDisplayedRowCount();
        }
    }

    // ------- הורדה לאקסל ------- //

    // מייצא את מה שמוצג כרגע בטבלה, כולל סינון ומיון
    function exportGrid(which) {
        if (which === 'list') {
            if (!listApi) {
                return;
            }
            listApi.exportDataAsCsv({
                fileName: getTodayDate() + ' ' + cfg.listTitle,
                columnKeys: ['code', 'name', 'points', 'multiple', cfg.countField],
                processCellCallback: (params) => params.column.getColId() === 'multiple'
                    ? MULTIPLE_LABELS[Number(params.value) || 0]
                    : params.value
            });
            return;
        }
        if (!recordsApi) {
            return;
        }
        let name = cfg.recordsTitle + (selected ? ' - ' + selected.name : '');
        recordsApi.exportDataAsCsv({ fileName: getTodayDate() + ' ' + name });
    }

    document.addEventListener("keypress", function (e) {
        if (e.target.tagName === "INPUT") {
            return;
        }
        if (e.key === "Enter") {
            const scanned = searchVal;
            searchVal = "";
            if (scanned == '999999999')
                login("./manage")
            else if (scanned == '011429519')
                login("./system")
        } else {
            searchVal += e.key;
        }
    });

    window.applyFilter = applyFilter;
    window.exportGrid = exportGrid;
    window.addItem = addItem;
    window.reloadList = reloadList;
}
