"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScannerService = void 0;
const backendService_1 = require("./backendService");
const logger_1 = require("../utils/logger");
class ScannerService {
    backendService;
    constructor(backendService) {
        this.backendService = backendService || new backendService_1.BackendService();
    }
    async scan(request) {
        logger_1.Logger.info(`Initiating security scan for: ${request.filePath} (${request.language})`);
        const response = await this.backendService.scanCode(request);
        if (!response.success) {
            logger_1.Logger.warn(`Scan completed with error: ${response.errorMessage}`);
        }
        else {
            logger_1.Logger.info(`Scan completed in ${response.scanDurationMs}ms. Found ${response.totalFindings} potential issue(s).`);
        }
        return response;
    }
}
exports.ScannerService = ScannerService;
//# sourceMappingURL=scannerService.js.map