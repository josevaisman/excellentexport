/**
 * ExcellentExport 3.7.2
 * A client side Javascript export to Excel.
 *
 * @author: Jordi Burgos (jordiburgos@gmail.com)
 * @url: https://github.com/jmaister/excellentexport
 *
 */

import * as XLSX from 'xlsx';
import { CellTypes, FormatDefinition, PredefinedFormat, CellFormats, CellPatterns } from './format';

import * as utils from './utils';

// Fix for IE11: https://stackoverflow.com/questions/69485778/new-typescript-version-does-not-include-window-navigator-mssaveblob
declare global {
    interface Navigator {
        msSaveBlob?: (blob: any, defaultName?: string) => boolean
    }
}

export interface ConvertOptions {
    anchor?: (string|HTMLAnchorElement),
    openAsDownload?: boolean,
    format: ('csv' | 'xls' | 'xlsx'),
    filename?: string,
    rtl?: boolean,
}
export interface FromOptions {
    table?: (string|HTMLTableElement),
    array?: any[][],
}

export interface SheetOptions {
    name: string,
    from: FromOptions,
    removeColumns?: number[],
    filterRowFn?(row:any[]): boolean ,
    fixValue?(value:any, row:number, column:number): any,
    fixArray?(array:any[][]): any[][],
    rtl?: boolean,
    formats?: (FormatDefinition | null)[],
}

/*
export type ExcellentExportType = {
    version: () => string,
    formats: CellFormats,
    excel: (anchor:(HTMLAnchorElement|string), table:HTMLTableElement, name:string) => void,
    csv: (anchor:(HTMLAnchorElement|string), table:HTMLTableElement, delimiter?:string, newLine?:string) => void,
    convert: (options:ConvertOptions, sheets:SheetOptions[]) => void,
}
*/

const ExcellentExport = function() {

    const version = "3.9.5";

    /*
     ExcellentExport.convert(options, sheets);

     Options:
     {
        anchor: String or HTML Element,
        openAsDownload: boolean, // Use this options if not using an anchor tag
        format: 'xlsx' or 'xls' or 'csv',
        filename: String,
        rtl: boolean (optional), specify if all the workbook has text in RTL mode
     }

     Sheets must be an array of sheet configuration objects. Sheet description:
     [
        {
            name: 'Sheet 1', // Sheet name
            from: {
                table: String/Element, // Table ID or table element
                array: [...] // Array with the data. Array where each element is a row. Every row is an array of the cells.
            },
            removeColumns: [...], // Array of column indexes (from 0)
            filterRowFn: function(row) {return true}, // Function to decide which rows are returned
            fixValue: function(value, row, column) {return fixedValue} // Function to fix values, receiving value, row num, column num
            fixArray: function(array) {return array} // Function to manipulate the whole data array
            rtl: boolean // optional: specify if the sheet has text in RTL mode
            ...
        },
        {
            ...
        }, ...
    ]
    */
    const convert = function(options:ConvertOptions, sheets:SheetOptions[]) {
        const workbook = {
            SheetNames: [],
            Sheets: {},
            Views: []
        };

        if (!options.format) {
            throw new Error("'format' option must be defined");
        }
        if (options.format === 'csv' && sheets.length > 1) {
            throw new Error("'csv' format only supports one sheet");
        }

        sheets.forEach(function(sheetConf:SheetOptions, index:number) {
            const name = sheetConf.name;
            if (!name) {
                throw new Error('Sheet ' + index + ' must have the property "name".');
            }

            // Select data source
            let dataArray: any[][];
            if (sheetConf.from && sheetConf.from.table) {
                dataArray = utils.tableToArray(utils.getTable(sheetConf.from.table));
            } else if(sheetConf.from && sheetConf.from.array) {
                dataArray = sheetConf.from.array
            } else {
                throw new Error('No data for sheet: [' + name + ']');
            }

            // Filter rows
            if (sheetConf.filterRowFn) {
                if (sheetConf.filterRowFn instanceof Function) {
                    dataArray = dataArray.filter(sheetConf.filterRowFn);
                } else {
                    throw new Error('Parameter "filterRowFn" must be a function.');
                }
            }
            // Filter columns
            if (sheetConf.removeColumns) {
                utils.removeColumns(dataArray, sheetConf.removeColumns);
            }

            // Convert data. Function applied to each value independently, receiving (value, rownum, colnum)
            if (sheetConf.fixValue && typeof sheetConf.fixValue === 'function') {
                const fn = sheetConf.fixValue;
                dataArray.map((r, rownum) => {
                    r.map((value, colnum) => {
                        dataArray[rownum][colnum] = fn(value, rownum, colnum);
                    });
                });
            }

            // Convert data, whole array
            if (sheetConf.fixArray && typeof sheetConf.fixArray === 'function') {
                const fn = sheetConf.fixArray;
                dataArray = fn(dataArray);
            }

            // Create sheet
            workbook.SheetNames.push(name);
            const worksheet = XLSX.utils.aoa_to_sheet(dataArray, {sheet: name} as XLSX.AOA2SheetOpts);
            
            // Apply format
            if (sheetConf.formats) {
                sheetConf.formats.forEach(f => {
                    const range = XLSX.utils.decode_range(f.range);
                    for (let R = range.s.r; R <= range.e.r; ++R) {
                        for (let C = range.s.c; C <= range.e.c; ++C) {
                            const cell = worksheet[XLSX.utils.encode_cell({r: R, c: C})];
                            if (cell && utils.hasContent(cell.v)) {
                                // type
                                cell.t = f.format.type;

                                // type fix
                                if (f.format?.type == CellTypes.BOOLEAN) {
                                    const v = cell.v.toString().toLowerCase();
                                    if (v == 'true' || v == '1') cell.v = true;
                                    if (v == 'false' || v == '0') cell.v = false;
                                }
                                // pattern
                                if (f.format?.pattern) {
                                    cell.z = f.format.pattern;
                                }
                            }
                        }
                    }
                });
            }
                
                
            workbook.Sheets[name] = worksheet;
            workbook.Views.push({RTL: options.rtl || sheetConf.rtl || false});
        });

        const wbOut:string = XLSX.write(workbook, {bookType: options.format, bookSST:true, type: 'binary', compression: true});
        try {
            const blob = new Blob([utils.string2ArrayBuffer(wbOut)], { type: "application/octet-stream" });
            const filename = (options.filename || 'download') + '.' + options.format;
            // Support for IE.
            if (window.navigator.msSaveBlob) {
                window.navigator.msSaveBlob(blob, filename);
                return false;
            }
            if (options.anchor) {
                const anchor = utils.getAnchor(options.anchor);
                anchor.href = window.URL.createObjectURL(blob);
                anchor.download = filename;
            } else if (options.openAsDownload) {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                throw new Error('Options should specify an anchor or openAsDownload=true.')
            }

        } catch(e) {
            throw new Error('Error converting to '+ options.format + '. ' + e);
        }
        return wbOut;

    };

    return {
        version: function(): string {
            return version;
        },
        excel: function(anchor:(HTMLAnchorElement|string), table:HTMLTableElement, name:string) {
            table = utils.getTable(table);
            anchor = utils.getAnchor(anchor);
            const ctx = {worksheet: name || 'Worksheet', table: table.innerHTML};
            const b64 = utils.base64(utils.format(utils.templates.excel, ctx));
            return utils.createDownloadLink(anchor, b64, 'application/vnd.ms-excel','export.xls');
        },
        csv: function(anchor:(HTMLAnchorElement|string), table:HTMLTableElement, delimiter?:string, newLine?:string) {
            let csvDelimiter = ",";
            let csvNewLine = "\r\n";

            if (delimiter !== undefined && delimiter) {
                csvDelimiter = delimiter;
            }
            if (newLine !== undefined && newLine) {
                csvNewLine = newLine;
            }

            table = utils.getTable(table);
            anchor = utils.getAnchor(anchor);
            const csvData = "\uFEFF" + utils.tableToCSV(table, csvDelimiter, csvNewLine);
            const b64 = utils.base64(csvData);
            return utils.createDownloadLink(anchor, b64, 'application/csv', 'export.csv');
        },
        convert: function(options:ConvertOptions, sheets:SheetOptions[]) {
            return convert(options, sheets);
        },
        formats: PredefinedFormat,
        cellTypes: CellTypes,
        cellPatterns: CellPatterns,
    };
}();

export default ExcellentExport;
