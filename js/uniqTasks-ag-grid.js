var gridOptions
var columnDefs = [
    { field: "name" },
    { field: "points" },
    { field: "code" },
    { field: "barcode" },
    { field: "position" },
    { field: "class" },
    { field: "used" }
];

function ExportUniqTasks() {
    var params = {
        tableName: new Date().toISOString().split('T')[0] + ' uniqTasks',
    };
    gridOptions.api.exportDataAsCsv(params);
}

document.addEventListener('DOMContentLoaded', function () {
    tableName = 'uniqTasks'
    window.expose.SendExcel("sendReadExcel", tableName);
    window.expose.ReceiveExcel("receiveReadExcel" + tableName, (data) => {
        if (data != 0) {
            gridOptions = {
                columnDefs: columnDefs,
                rowData: JSON.parse(data),
            };
            var gridDiv = document.querySelector('#tasksGrid');
            new agGrid.Grid(gridDiv, gridOptions);
        }
    });
});


