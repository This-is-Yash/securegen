import { BackendService } from './backendService';
import { ScanRequest, ScanResponse, Vulnerability } from '../types/vulnerability';
import { Logger } from '../utils/logger';

export class ScannerService {
    private backendService: BackendService;

    constructor(backendService?: BackendService) {
        this.backendService = backendService || new BackendService();
    }

    public async scan(request: ScanRequest): Promise<ScanResponse> {
        Logger.info(`Initiating security scan for: ${request.filePath} (${request.language})`);
        const response = await this.backendService.scanCode(request);

        if (!response.success) {
            Logger.warn(`Scan completed with error: ${response.errorMessage}`);
        } else {
            Logger.info(
                `Scan completed in ${response.scanDurationMs}ms. Found ${response.totalFindings} potential issue(s).`
            );
        }

        return response;
    }
}
