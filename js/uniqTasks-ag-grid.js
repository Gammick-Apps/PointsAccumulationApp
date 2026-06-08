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
        fileName: new Date().toISOString().split('T')[0] + ' uniqTasks',
    };
    gridOptions.api.exportDataAsCsv(params);
}

document.addEventListener('DOMContentLoaded', function () {
    fileName = 'uniqTasks'
    window.expose.SendExcel("sendReadExcel", fileName);
    window.expose.ReceiveExcel("receiveReadExcel" + fileName, (data) => {
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


