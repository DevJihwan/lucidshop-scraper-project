const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class FailedItemsRecoveryScript {
    constructor() {
        this.baseUrl = 'https://lucidshop.kr';
        this.finalImagePath = './final_image_v2';
        this.finalDataPath = './final_data';
        this.progressFile = './failed_items_recovery_progress.json';
        
        this.failedItems = [];
        this.recoveredItems = [];
        this.finalFailedItems = [];
        
        this.progress = {
            currentIndex: 0,
            totalItems: 0,
            successCount: 0,
            failedCount: 0,
            startTime: Date.now()
        };
        
        this.stats = {
            totalAttempted: 0,
            imageDownloaded: 0,
            detailUrlFound: 0,
            detailUrlNotFound: 0,
            downloadSuccess: 0,
            downloadFailed: 0
        };
        
        console.log('실패 항목 복구 스크립트 초기화...');
    }

    async init() {
        await this.loadFailedItems();
        await this.loadProgress();
        
        console.log('실패 항목 복구 스크립트 초기화 완료');
        console.log(`복구 대상: ${this.failedItems.length}개`);
        console.log(`진행률: ${this.progress.currentIndex}/${this.progress.totalItems}\n`);
        
        return this;
    }

    async loadFailedItems() {
        try {
            console.log('실패 항목 로드 중...');
            
            // 개선된 갭 필링 보고서에서 실패 항목 로드
            const reportData = JSON.parse(await fs.readFile('./improved_gap_779_report.json', 'utf8'));
            
            if (reportData.failedItems && reportData.failedItems.length > 0) {
                this.failedItems = reportData.failedItems;
                this.progress.totalItems = this.failedItems.length;
                
                console.log(`   실패 항목 ${this.failedItems.length}개 로드됨`);
                
                // 실패 원인별 분류
                const failureReasons = {};
                this.failedItems.forEach(item => {
                    const reason = item.error || 'Unknown';
                    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
                });
                
                console.log('   실패 원인별 분류:');
                Object.entries(failureReasons).forEach(([reason, count]) => {
                    console.log(`     - ${reason}: ${count}개`);
                });
                
            } else {
                console.log('   복구할 실패 항목이 없습니다.');
                this.failedItems = [];
                this.progress.totalItems = 0;
            }
            
        } catch (error) {
            console.error('실패 항목 로드 오류:', error.message);
            throw error;
        }
    }

    async loadProgress() {
        try {
            const progressData = await fs.readFile(this.progressFile, 'utf8');
            const savedProgress = JSON.parse(progressData);
            this.progress = { ...this.progress, ...savedProgress };
            
            console.log('이전 복구 진행 상황 로드됨:');
            console.log(`   현재 진행: ${this.progress.currentIndex}/${this.progress.totalItems}`);
            console.log(`   성공: ${this.progress.successCount}개`);
            console.log(`   실패: ${this.progress.failedCount}개\n`);
            
        } catch (error) {
            console.log('새로운 복구 작업 시작\n');
        }
    }

    async saveProgress() {
        this.progress.lastSaveTime = new Date().toISOString();
        this.progress.totalElapsedTime = Date.now() - this.progress.startTime;
        
        await fs.writeFile(this.progressFile, JSON.stringify(this.progress, null, 2));
    }

    async executeRecovery() {
        console.log('====== 실패 항목 복구 시작 ======\n');
        
        if (this.failedItems.length === 0) {
            console.log('복구할 항목이 없습니다!');
            return { success: true, message: '모든 항목이 완성되었습니다.' };
        }
        
        const startIndex = this.progress.currentIndex;
        const itemsToProcess = this.failedItems.slice(startIndex);
        
        console.log(`복구 시작: ${itemsToProcess.length}개 (전체 ${this.failedItems.length}개 중 ${startIndex + 1}번째부터)`);
        
        for (let i = 0; i < itemsToProcess.length; i++) {
            const currentIndex = startIndex + i;
            const failedItem = itemsToProcess[i];
            
            console.log(`\n[${currentIndex + 1}/${this.failedItems.length}] 복구 시도 중...`);
            console.log(`대상: [${failedItem.category}/${failedItem.brand}] ${failedItem.productName || failedItem.originalProductName}`);
            console.log(`원래 오류: ${failedItem.error}`);
            
            try {
                this.stats.totalAttempted++;
                
                const success = await this.recoverSingleItem(failedItem);
                
                if (success) {
                    console.log(`   ✅ 복구 성공`);
                    this.progress.successCount++;
                    this.recoveredItems.push({
                        ...failedItem,
                        recoveredAt: new Date().toISOString(),
                        recoveryMethod: 'enhanced_detailUrl_search'
                    });
                } else {
                    throw new Error('복구 실패');
                }
                
            } catch (error) {
                console.log(`   ❌ 복구 실패: ${error.message}`);
                
                this.progress.failedCount++;
                this.finalFailedItems.push({
                    ...failedItem,
                    finalError: error.message,
                    finalFailedAt: new Date().toISOString()
                });
            }
            
            this.progress.currentIndex = currentIndex + 1;
            
            if ((i + 1) % 5 === 0) {
                await this.saveProgress();
                console.log(`   💾 복구 진행 상황 저장됨 (${this.progress.currentIndex}/${this.progress.totalItems})`);
            }
            
            await this.delay(1500);
        }
        
        const finalReport = await this.generateRecoveryReport();
        
        console.log('\n====== 실패 항목 복구 완료 ======');
        
        return finalReport;
    }

    async recoverSingleItem(failedItem) {
        try {
            console.log(`   향상된 detailUrl 검색 시작...`);
            
            // 1. 여러 방법으로 detailUrl 찾기
            const detailUrl = await this.findDetailUrlEnhanced(failedItem);
            
            if (!detailUrl) {
                this.stats.detailUrlNotFound++;
                throw new Error('모든 방법으로도 detailUrl을 찾을 수 없음');
            }
            
            this.stats.detailUrlFound++;
            console.log(`   detailUrl 발견: ${detailUrl}`);
            
            // 2. 이미지 추출
            const imageUrls = await this.extractImagesFromDetailPageImproved(detailUrl);
            
            if (imageUrls.length === 0) {
                throw new Error('상세 페이지에서 대표이미지를 찾을 수 없음');
            }
            
            console.log(`   추출된 이미지: ${imageUrls.length}개`);
            
            // 3. 대표이미지 다운로드 (첫 번째 이미지)
            const representativeImageUrl = imageUrls[0];
            
            const downloadResult = await this.downloadAndSaveImageRecovery(
                representativeImageUrl,
                failedItem.category,
                failedItem.brand,
                failedItem.productName || failedItem.originalProductName
            );
            
            if (downloadResult.success) {
                console.log(`   대표이미지 저장 성공 (${(downloadResult.fileSize / 1024).toFixed(1)}KB)`);
                this.stats.imageDownloaded++;
                this.stats.downloadSuccess++;
                return true;
            } else {
                this.stats.downloadFailed++;
                throw new Error(`대표이미지 다운로드 실패: ${downloadResult.error}`);
            }
            
        } catch (error) {
            console.log(`   복구 오류: ${error.message}`);
            return false;
        }
    }

    // 향상된 detailUrl 검색 메서드
    async findDetailUrlEnhanced(failedItem) {
        const searchMethods = [
            () => this.findDetailUrlFromFailedItem(failedItem),
            () => this.findDetailUrlFromCategoryData(failedItem),
            () => this.findDetailUrlFromProductName(failedItem),
            () => this.findDetailUrlFromSavedImageName(failedItem)
        ];
        
        for (const method of searchMethods) {
            try {
                const detailUrl = await method();
                if (detailUrl) {
                    console.log(`   detailUrl 찾기 성공: ${method.name}`);
                    return detailUrl;
                }
            } catch (error) {
                console.log(`   ${method.name} 실패: ${error.message}`);
            }
        }
        
        return null;
    }

    // 방법 1: 실패 항목 자체에서 detailUrl 찾기
    async findDetailUrlFromFailedItem(failedItem) {
        if (failedItem.detailUrl) {
            return failedItem.detailUrl;
        }
        
        if (failedItem.sourceData && failedItem.sourceData.detailUrl) {
            return failedItem.sourceData.detailUrl;
        }
        
        return null;
    }

    // 방법 2: 카테고리 데이터에서 상품명으로 검색
    async findDetailUrlFromCategoryData(failedItem) {
        try {
            const categoryName = failedItem.category;
            const categoryFile = path.join(this.finalDataPath, `${categoryName}_products.json`);
            const categoryData = JSON.parse(await fs.readFile(categoryFile, 'utf8'));
            
            let products = [];
            if (Array.isArray(categoryData)) {
                products = categoryData;
            } else if (categoryData.products && Array.isArray(categoryData.products)) {
                products = categoryData.products;
            }
            
            // 정확한 매칭
            const targetProduct = products.find(product => {
                const productName = product.productName || product.originalProductName || '';
                const failedProductName = failedItem.productName || failedItem.originalProductName || '';
                
                return this.normalizeText(productName) === this.normalizeText(failedProductName);
            });
            
            if (targetProduct && targetProduct.detailUrl) {
                return targetProduct.detailUrl;
            }
            
            // 부분 매칭
            const partialMatch = products.find(product => {
                const productName = product.productName || product.originalProductName || '';
                const failedProductName = failedItem.productName || failedItem.originalProductName || '';
                
                return productName.includes(failedProductName.replace(/\(대표\)$/, '').trim()) ||
                       failedProductName.includes(productName);
            });
            
            if (partialMatch && partialMatch.detailUrl) {
                return partialMatch.detailUrl;
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }

    // 방법 3: 저장된 이미지명에서 ID 추출
    async findDetailUrlFromSavedImageName(failedItem) {
        try {
            const savedImageName = failedItem.savedImageName;
            if (!savedImageName) return null;
            
            // 파일명에서 숫자 ID 추출 시도
            const idMatches = savedImageName.match(/(\d{10,})/g);
            
            if (idMatches && idMatches.length > 0) {
                for (const id of idMatches) {
                    const detailUrl = `https://lucidshop.kr/shop/item.php?it_id=${id}`;
                    
                    // URL 유효성 검사
                    try {
                        const response = await axios.head(detailUrl, { timeout: 5000 });
                        if (response.status === 200) {
                            return detailUrl;
                        }
                    } catch (error) {
                        // 다음 ID 시도
                        continue;
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }

    // 방법 4: 상품명으로 다른 카테고리에서 검색
    async findDetailUrlFromProductName(failedItem) {
        try {
            const productName = failedItem.productName || failedItem.originalProductName;
            if (!productName) return null;
            
            // 모든 카테고리 파일 검색
            const dataFiles = await fs.readdir(this.finalDataPath);
            const categoryFiles = dataFiles.filter(file => file.endsWith('_products.json'));
            
            for (const categoryFile of categoryFiles) {
                try {
                    const categoryData = JSON.parse(await fs.readFile(path.join(this.finalDataPath, categoryFile), 'utf8'));
                    
                    let products = [];
                    if (Array.isArray(categoryData)) {
                        products = categoryData;
                    } else if (categoryData.products && Array.isArray(categoryData.products)) {
                        products = categoryData.products;
                    }
                    
                    const matchedProduct = products.find(product => {
                        const pName = product.productName || product.originalProductName || '';
                        return this.normalizeText(pName) === this.normalizeText(productName.replace(/\(대표\)$/, '').trim());
                    });
                    
                    if (matchedProduct && matchedProduct.detailUrl) {
                        return matchedProduct.detailUrl;
                    }
                    
                } catch (error) {
                    // 다음 파일 시도
                    continue;
                }
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }

    // 개선된 이미지 추출 (원본 로직 재사용)
    async extractImagesFromDetailPageImproved(detailUrl) {
        try {
            const response = await axios.get(detailUrl, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
                }
            });
            
            const html = response.data;
            const imageUrls = [];
            
            // 1. 대표이미지 추출 (sit_pvi_big 영역)
            const representativeImageRegex = /<div[^>]*id="sit_pvi_big"[^>]*>(.*?)<\/div>/gis;
            const representativeMatch = representativeImageRegex.exec(html);
            
            if (representativeMatch) {
                const representativeHtml = representativeMatch[1];
                const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
                const imgMatch = imgRegex.exec(representativeHtml);
                
                if (imgMatch) {
                    const src = imgMatch[1];
                    const normalizedUrl = this.normalizeImageUrl(src);
                    
                    if (this.isValidProductImage(normalizedUrl)) {
                        imageUrls.push(normalizedUrl);
                        console.log(`     대표이미지 발견: ${normalizedUrl}`);
                    }
                }
            }
            
            // 2. 백업: thumb 이미지 찾기
            if (imageUrls.length === 0) {
                console.log(`     대표이미지 영역에서 찾을 수 없음, 백업 방식 사용...`);
                
                const backupImageRegex = /<img[^>]*src=["']([^"']*(?:data\/item|thumb)[^"']*)["'][^>]*>/gi;
                let backupMatch;
                
                while ((backupMatch = backupImageRegex.exec(html)) !== null) {
                    const src = backupMatch[1];
                    const normalizedUrl = this.normalizeImageUrl(src);
                    
                    if (this.isValidProductImage(normalizedUrl) && !imageUrls.includes(normalizedUrl)) {
                        imageUrls.push(normalizedUrl);
                        if (imageUrls.length >= 3) break; // 최대 3개까지만
                    }
                }
            }
            
            return imageUrls;
            
        } catch (error) {
            console.log(`     상세 페이지 접근 오류: ${error.message}`);
            return [];
        }
    }

    // 이미지 유효성 검증
    isValidProductImage(url) {
        if (!url || typeof url !== 'string') return false;
        if (!url.includes('http')) return false;
        
        const excludePatterns = [
            'facebook.png', 'twitter.png', 'instagram.png',
            'icon_', 'ico_', 'btn_', 'logo_', 'banner_'
        ];
        
        for (const pattern of excludePatterns) {
            if (url.toLowerCase().includes(pattern.toLowerCase())) {
                return false;
            }
        }
        
        const includePatterns = ['data/item', 'data/editor', 'thumb', 'trendell.store'];
        return includePatterns.some(pattern => 
            url.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    normalizeImageUrl(src) {
        let fullUrl = src;
        
        if (src.startsWith('http://') || src.startsWith('https://')) {
            fullUrl = src;
        } else if (src.startsWith('/')) {
            fullUrl = 'https://lucidshop.kr' + src;
        } else {
            fullUrl = 'https://lucidshop.kr/' + src;
        }
        
        try {
            const urlObj = new URL(fullUrl);
            if (urlObj.hostname === '43.202.198.24') {
                urlObj.hostname = 'trendell.store';
                fullUrl = urlObj.toString();
            }
            if (urlObj.protocol === 'http:') {
                urlObj.protocol = 'https:';
                fullUrl = urlObj.toString();
            }
        } catch (error) {
            // URL 파싱 실패 시 원본 유지
        }
        
        return fullUrl;
    }

    async downloadAndSaveImageRecovery(imageUrl, category, brand, productName) {
        try {
            if (!this.isValidProductImage(imageUrl)) {
                throw new Error('유효하지 않은 이미지 URL');
            }
            
            console.log(`       대표이미지 다운로드: ${imageUrl}`);
            
            const response = await axios({
                method: 'GET',
                url: imageUrl,
                responseType: 'arraybuffer',
                timeout: 15000,
                maxRedirects: 3,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer': 'https://lucidshop.kr/'
                }
            });

            if (response.data.byteLength < 3000) {
                throw new Error('이미지 파일이 너무 작음 (3KB 미만)');
            }

            const contentType = response.headers['content-type'] || '';
            let extension = '.jpg';
            if (contentType.includes('png')) extension = '.png';
            else if (contentType.includes('gif')) extension = '.gif';
            else if (contentType.includes('webp')) extension = '.webp';

            const timestamp = Date.now() % 1000000;
            const cleanProductName = productName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
            const fileName = `${cleanProductName}_${timestamp}(대표_복구)${extension}`;
            
            const targetDir = path.join(this.finalImagePath, category, brand, productName);
            
            try {
                await fs.access(targetDir);
            } catch {
                await fs.mkdir(targetDir, { recursive: true });
                console.log(`       폴더 생성: ${targetDir}`);
            }
            
            const filePath = path.join(targetDir, fileName);
            await fs.writeFile(filePath, response.data);
            
            return {
                success: true,
                fileName,
                savedPath: filePath,
                fileSize: response.data.byteLength
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    normalizeText(text) {
        return (text || '')
            .toLowerCase()
            .replace(/[<>:"/\\|?*\[\]()]/g, '')
            .replace(/[-_\s]+/g, ' ')
            .trim();
    }

    async generateRecoveryReport() {
        const report = {
            completionDateTime: new Date().toISOString(),
            method: 'enhanced_detailUrl_search_recovery',
            version: '1.0',
            totalFailedItems: this.failedItems.length,
            results: {
                totalAttempted: this.stats.totalAttempted,
                successCount: this.progress.successCount,
                finalFailedCount: this.progress.failedCount,
                recoveryRate: this.stats.totalAttempted > 0 ? 
                    ((this.progress.successCount / this.stats.totalAttempted) * 100).toFixed(1) + '%' : '0%'
            },
            detailedStats: {
                detailUrlFound: this.stats.detailUrlFound,
                detailUrlNotFound: this.stats.detailUrlNotFound,
                imageDownloaded: this.stats.imageDownloaded,
                downloadSuccess: this.stats.downloadSuccess,
                downloadFailed: this.stats.downloadFailed
            },
            recoveredItems: this.recoveredItems,
            finalFailedItems: this.finalFailedItems,
            elapsedTime: {
                totalMinutes: ((Date.now() - this.progress.startTime) / 1000 / 60).toFixed(1),
                averagePerItem: this.stats.totalAttempted > 0 ?
                    (((Date.now() - this.progress.startTime) / 1000) / this.stats.totalAttempted).toFixed(1) + 's' : '0s'
            }
        };
        
        await fs.writeFile('./failed_items_recovery_report.json', JSON.stringify(report, null, 2));
        
        console.log('\n📊 === 실패 항목 복구 보고서 ===');
        console.log(`복구 대상: ${report.totalFailedItems}개`);
        console.log(`복구 성공: ${report.results.successCount}개 (${report.results.recoveryRate})`);
        console.log(`최종 실패: ${report.results.finalFailedCount}개`);
        console.log(`detailUrl 발견: ${report.detailedStats.detailUrlFound}개`);
        console.log(`이미지 다운로드: ${report.detailedStats.imageDownloaded}개`);
        console.log(`소요 시간: ${report.elapsedTime.totalMinutes}분`);
        
        if (report.results.finalFailedCount > 0) {
            console.log('\n❌ 최종 실패 항목:');
            this.finalFailedItems.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. [${item.category}/${item.brand}] ${item.productName || item.originalProductName}`);
                console.log(`   └─ ${item.finalError}`);
            });
        }
        
        console.log(`\n💾 상세 보고서: failed_items_recovery_report.json`);
        
        return report;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        try {
            await fs.unlink(this.progressFile);
            console.log('복구 진행 상황 파일 정리 완료');
        } catch (error) {
            // 파일이 없어도 상관없음
        }
    }
}

// 메인 실행 함수
async function main() {
    const recoveryScript = new FailedItemsRecoveryScript();
    
    try {
        console.log('====== 실패 항목 복구 스크립트 시작 ======');
        console.log('향상된 detailUrl 검색으로 53개 missing_image 복구\n');
        
        await recoveryScript.init();
        const results = await recoveryScript.executeRecovery();
        
        console.log('\n====== 실패 항목 복구 완료 ======');
        console.log('향상된 검색 방식으로 복구 작업 완료!');
        
        return results;
        
    } catch (error) {
        console.error('복구 작업 중 오류:', error);
        throw error;
    } finally {
        await recoveryScript.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = FailedItemsRecoveryScript;