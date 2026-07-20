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
    tableName = 'uniqTasks'
    window.expose.sendDbData("sendGetDataByTable", tableName);
    window.expose.receiveDbData("receiveGetDataByTable" + tableName, (data) => {
        if (Array.isArray(data)) {
            gridOptions = {
                columnDefs: columnDefs,
                rowData: data,
            };
            var gridDiv = document.querySelector('#tasksGrid');
            new agGrid.Grid(gridDiv, gridOptions);
        }
    });
});


