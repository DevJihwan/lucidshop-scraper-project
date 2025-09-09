const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class MissingImageCollector {
    constructor() {
        this.baseUrl = 'https://lucidshop.kr';
        this.finalImagePath = './final_image_v2';
        this.progressFile = './missing_image_collection_progress.json';
        
        this.browser = null;
        this.page = null;
        this.missingImagesList = [];
        this.results = [];
        
        this.progress = {
            currentIndex: 0,
            totalTarget: 53,
            successCount: 0,
            failedCount: 0,
            startTime: Date.now(),
            completedItems: [],
            failedItems: []
        };
        
        this.stats = {
            totalAttempted: 0,
            imageDownloaded: 0,
            folderCreated: 0,
            searchSuccessful: 0,
            searchFailed: 0
        };
        
        console.log('대표이미지 누락 53개 상품 수집 시스템 초기화...');
    }

    async init() {
        // 싱크 검증 결과에서 누락 이미지 리스트 로드
        await this.loadMissingImagesList();
        
        // 이전 진행 상황 로드
        await this.loadProgress();
        
        // 브라우저 초기화
        this.browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ],
            defaultViewport: { width: 1920, height: 1080 }
        });
        
        this.page = await this.browser.newPage();
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this.page.setDefaultTimeout(30000);
        
        console.log('누락 이미지 수집 시스템 초기화 완료');
        console.log(`대상: ${this.missingImagesList.length}개 상품`);
        console.log(`진행률: ${this.progress.currentIndex}/${this.progress.totalTarget}\n`);
        
        return this;
    }

    async loadMissingImagesList() {
        try {
            // improved_sync_verification_report.json에서 누락 이미지 정보 로드
            const syncReport = JSON.parse(await fs.readFile('./improved_sync_verification_report.json', 'utf8'));
            
            if (syncReport.syncDetails && syncReport.syncDetails.missingImages) {
                this.missingImagesList = syncReport.syncDetails.missingImages;
                console.log(`싱크 보고서에서 ${this.missingImagesList.length}개 누락 이미지 발견`);
            } else {
                // 폴백: final_image_v2에서 직접 스캔
                console.log('싱크 보고서에서 누락 이미지 정보 없음 - 직접 스캔 수행');
                await this.scanForMissingImages();
            }
            
            this.progress.totalTarget = this.missingImagesList.length;
            
        } catch (error) {
            console.log('싱크 보고서 로드 실패 - 직접 스캔 수행');
            await this.scanForMissingImages();
        }
    }

    async scanForMissingImages() {
        console.log('final_image_v2에서 대표이미지 누락 상품 직접 스캔...');
        
        const missingImages = [];
        const categories = await fs.readdir(this.finalImagePath);
        
        for (const category of categories) {
            if (category.startsWith('.')) continue;
            
            const categoryPath = path.join(this.finalImagePath, category);
            const brands = await fs.readdir(categoryPath);
            
            for (const brand of brands) {
                if (brand.startsWith('.')) continue;
                
                const brandPath = path.join(categoryPath, brand);
                const products = await fs.readdir(brandPath);
                
                for (const product of products) {
                    if (product.startsWith('.')) continue;
                    
                    const productPath = path.join(brandPath, product);
                    const files = await fs.readdir(productPath);
                    
                    // 대표 이미지 확인
                    const hasRepImage = files.some(file => 
                        file.includes('(대표)') || file.includes('(보완)')
                    );
                    
                    if (!hasRepImage) {
                        missingImages.push({
                            category,
                            brand,
                            productName: product,
                            hasRepresentativeImage: false,
                            imageCount: files.filter(file => this.isImageFile(file)).length,
                            files: files
                        });
                    }
                }
            }
        }
        
        this.missingImagesList = missingImages;
        console.log(`직접 스캔 결과: ${missingImages.length}개 누락 이미지 발견\n`);
    }

    async loadProgress() {
        try {
            const progressData = await fs.readFile(this.progressFile, 'utf8');
            const savedProgress = JSON.parse(progressData);
            this.progress = { ...this.progress, ...savedProgress };
            
            console.log('이전 진행 상황 로드됨:');
            console.log(`   현재 진행: ${this.progress.currentIndex}/${this.progress.totalTarget}`);
            console.log(`   성공: ${this.progress.successCount}개`);
            console.log(`   실패: ${this.progress.failedCount}개`);
            
        } catch (error) {
            console.log('새로운 수집 작업 시작');
        }
    }

    async saveProgress() {
        this.progress.lastSaveTime = new Date().toISOString();
        this.progress.totalElapsedTime = Date.now() - this.progress.startTime;
        
        await fs.writeFile(this.progressFile, JSON.stringify(this.progress, null, 2));
    }

    async executeMissingImageCollection() {
        console.log('====== 대표이미지 누락 53개 상품 수집 시작 ======\n');
        
        if (this.missingImagesList.length === 0) {
            console.log('수집할 누락 이미지가 없습니다!');
            return { success: true, message: '모든 상품에 대표이미지가 있습니다.' };
        }
        
        // 진행 상황에 따라 시작점 조정
        const startIndex = this.progress.currentIndex;
        const itemsToProcess = this.missingImagesList.slice(startIndex);
        
        console.log(`수집 대상: ${itemsToProcess.length}개 (전체 ${this.missingImagesList.length}개 중 ${startIndex + 1}번째부터)`);
        
        for (let i = 0; i < itemsToProcess.length; i++) {
            const currentIndex = startIndex + i;
            const item = itemsToProcess[i];
            
            console.log(`\n[${currentIndex + 1}/${this.missingImagesList.length}] 수집 중...`);
            console.log(`대상: [${item.category}/${item.brand}] ${item.productName}`);
            
            try {
                this.stats.totalAttempted++;
                
                // 1. 웹에서 해당 상품 검색
                const foundProduct = await this.searchProductOnWeb(item);
                
                if (foundProduct && foundProduct.imageUrl) {
                    console.log(`   이미지 URL 발견: ${foundProduct.imageUrl}`);
                    
                    // 2. 이미지 다운로드
                    const downloadResult = await this.downloadAndSaveImage(
                        foundProduct.imageUrl,
                        item.category,
                        item.brand,
                        item.productName
                    );
                    
                    if (downloadResult.success) {
                        console.log(`   ✅ 성공: ${downloadResult.savedPath}`);
                        
                        this.progress.successCount++;
                        this.progress.completedItems.push({
                            ...item,
                            downloadResult,
                            completedAt: new Date().toISOString()
                        });
                        
                        this.results.push({
                            category: item.category,
                            brand: item.brand,
                            productName: item.productName,
                            originalImageUrl: foundProduct.imageUrl,
                            savedImageName: downloadResult.fileName,
                            savedPath: downloadResult.savedPath,
                            status: 'success',
                            collectionTime: new Date().toISOString()
                        });
                        
                        this.stats.imageDownloaded++;
                        this.stats.searchSuccessful++;
                        
                    } else {
                        throw new Error(`이미지 다운로드 실패: ${downloadResult.error}`);
                    }
                } else {
                    throw new Error('웹에서 해당 상품의 이미지를 찾을 수 없습니다');
                }
                
            } catch (error) {
                console.log(`   ❌ 실패: ${error.message}`);
                
                this.progress.failedCount++;
                this.progress.failedItems.push({
                    ...item,
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
                
                this.stats.searchFailed++;
            }
            
            // 진행 상황 업데이트
            this.progress.currentIndex = currentIndex + 1;
            
            // 주기적 저장 (매 5개마다)
            if ((i + 1) % 5 === 0) {
                await this.saveProgress();
                console.log(`   💾 진행 상황 저장됨 (${this.progress.currentIndex}/${this.progress.totalTarget})`);
            }
            
            // 요청 간격 (서버 부하 방지)
            await this.delay(3000);
        }
        
        // 최종 저장
        await this.saveProgress();
        
        // 결과 리포트 생성
        const finalReport = await this.generateFinalReport();
        
        console.log('\n====== 대표이미지 누락 상품 수집 완료 ======');
        
        return finalReport;
    }

    async searchProductOnWeb(item) {
        const { category, brand, productName } = item;
        
        try {
            // 검색 쿼리 생성 (브랜드 + 상품명 핵심 키워드)
            const searchKeywords = this.extractSearchKeywords(productName, brand);
            const searchUrl = `https://lucidshop.kr/shop/search.php?sfl=wr_subject&stx=${encodeURIComponent(searchKeywords)}`;
            
            console.log(`   검색 키워드: "${searchKeywords}"`);
            
            await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
            await this.delay(2000);
            
            // 검색 결과에서 상품 추출
            const searchResults = await this.extractSearchResults();
            
            if (searchResults.length === 0) {
                throw new Error('검색 결과 없음');
            }
            
            // 가장 유사한 상품 찾기
            const bestMatch = this.findBestMatch(searchResults, item);
            
            if (bestMatch && bestMatch.similarity > 0.6) {
                console.log(`   매칭 성공: "${bestMatch.productName}" (유사도: ${(bestMatch.similarity * 100).toFixed(1)}%)`);
                return bestMatch;
            } else {
                throw new Error('유사한 상품 매칭 실패');
            }
            
        } catch (error) {
            console.log(`   검색 오류: ${error.message}`);
            return null;
        }
    }

    extractSearchKeywords(productName, brand) {
        // 상품명에서 핵심 키워드 추출
        const cleanName = productName
            .replace(/\(대표\)|\(보완\)/g, '')
            .replace(/[_\-]/g, ' ')
            .trim();
        
        // 브랜드명과 상품 유형 키워드 추출
        const keywords = [brand];
        
        // 상품명에서 중요 단어 추출 (첫 3-4개 단어)
        const nameWords = cleanName.split(/[\s_]+/).slice(0, 4);
        keywords.push(...nameWords);
        
        return keywords.join(' ').trim();
    }

    async extractSearchResults() {
        return await this.page.evaluate(() => {
            const productItems = document.querySelectorAll('.sct_10.lists-row .sct_li, .sct_li');
            
            return Array.from(productItems).map(item => {
                try {
                    const nameElement = item.querySelector('.sct_txt a');
                    if (!nameElement) return null;
                    
                    const productName = nameElement.textContent.trim();
                    if (!productName) return null;
                    
                    let imageUrl = '';
                    const imgElement = item.querySelector('.sct_img img, img[src*="thumb"]');
                    if (imgElement && imgElement.src && !imgElement.src.includes('icon')) {
                        imageUrl = imgElement.src;
                    }
                    
                    return {
                        productName,
                        imageUrl,
                        detailUrl: nameElement.href
                    };
                } catch (error) {
                    return null;
                }
            }).filter(product => product !== null);
        });
    }

    findBestMatch(searchResults, targetItem) {
        let bestMatch = null;
        let highestSimilarity = 0;
        
        for (const result of searchResults) {
            const similarity = this.calculateSimilarity(
                this.normalizeText(targetItem.productName),
                this.normalizeText(result.productName)
            );
            
            if (similarity > highestSimilarity) {
                highestSimilarity = similarity;
                bestMatch = {
                    ...result,
                    similarity
                };
            }
        }
        
        return bestMatch;
    }

    async downloadAndSaveImage(imageUrl, category, brand, productName) {
        try {
            if (!imageUrl || imageUrl.includes('facebook') || imageUrl.includes('twitter')) {
                throw new Error('유효하지 않은 이미지 URL');
            }
            
            // 이미지 다운로드
            const response = await axios({
                method: 'GET',
                url: imageUrl,
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Referer': 'https://lucidshop.kr/'
                }
            });

            if (response.data.byteLength < 3000) {
                throw new Error('이미지 파일이 너무 작음');
            }

            // 파일 확장자 결정
            const contentType = response.headers['content-type'] || '';
            let extension = '.jpg';
            if (contentType.includes('png')) extension = '.png';
            else if (contentType.includes('webp')) extension = '.webp';

            // 파일명 생성
            const timestamp = Date.now() % 1000000;
            const fileName = `${productName}_missing_recovery_${timestamp}(대표)${extension}`;
            
            // 저장 경로 확인 및 생성
            const targetDir = path.join(this.finalImagePath, category, brand, productName);
            
            try {
                await fs.access(targetDir);
            } catch {
                await fs.mkdir(targetDir, { recursive: true });
                this.stats.folderCreated++;
            }
            
            const filePath = path.join(targetDir, fileName);
            
            // 파일 저장
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

    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const len1 = str1.length;
        const len2 = str2.length;
        
        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;
        
        const matrix = Array(len2 + 1).fill().map(() => Array(len1 + 1).fill(0));
        
        for (let i = 0; i <= len1; i++) matrix[0][i] = i;
        for (let j = 0; j <= len2; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= len2; j++) {
            for (let i = 1; i <= len1; i++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j - 1][i] + 1,
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }
        
        const maxLen = Math.max(len1, len2);
        return (maxLen - matrix[len2][len1]) / maxLen;
    }

    isImageFile(filename) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
        return imageExtensions.some(ext => 
            filename.toLowerCase().endsWith(ext)
        );
    }

    async generateFinalReport() {
        const report = {
            completionDateTime: new Date().toISOString(),
            targetItems: this.missingImagesList.length,
            results: {
                totalAttempted: this.stats.totalAttempted,
                successCount: this.progress.successCount,
                failedCount: this.progress.failedCount,
                successRate: this.stats.totalAttempted > 0 ? 
                    ((this.progress.successCount / this.stats.totalAttempted) * 100).toFixed(1) + '%' : '0%'
            },
            statistics: this.stats,
            collectedImages: this.results,
            failedItems: this.progress.failedItems,
            summary: {
                originalMissingImages: this.missingImagesList.length,
                recoveredImages: this.progress.successCount,
                remainingMissingImages: this.missingImagesList.length - this.progress.successCount,
                finalCompletionRate: this.missingImagesList.length > 0 ?
                    (((this.missingImagesList.length - (this.missingImagesList.length - this.progress.successCount)) / this.missingImagesList.length) * 100).toFixed(1) + '%' : '100%'
            },
            elapsedTime: {
                totalMinutes: ((Date.now() - this.progress.startTime) / 1000 / 60).toFixed(1),
                averagePerItem: this.stats.totalAttempted > 0 ?
                    (((Date.now() - this.progress.startTime) / 1000) / this.stats.totalAttempted).toFixed(1) + 's' : '0s'
            }
        };
        
        // 상세 보고서 저장
        await fs.writeFile('./missing_image_collection_report.json', JSON.stringify(report, null, 2));
        
        // 요약 출력
        console.log('\n📊 === 대표이미지 수집 완료 보고서 ===');
        console.log(`대상 상품: ${report.targetItems}개`);
        console.log(`수집 성공: ${report.results.successCount}개 (${report.results.successRate})`);
        console.log(`수집 실패: ${report.results.failedCount}개`);
        console.log(`최종 완성률: ${report.summary.finalCompletionRate}`);
        console.log(`소요 시간: ${report.elapsedTime.totalMinutes}분`);
        console.log(`상품당 평균 시간: ${report.elapsedTime.averagePerItem}`);
        
        if (report.results.failedCount > 0) {
            console.log('\n❌ 실패 항목:');
            this.progress.failedItems.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. [${item.category}/${item.brand}] ${item.productName}`);
                console.log(`   └─ ${item.error}`);
            });
            if (this.progress.failedItems.length > 5) {
                console.log(`   ... 외 ${this.progress.failedItems.length - 5}개`);
            }
        }
        
        console.log(`\n💾 상세 보고서: missing_image_collection_report.json`);
        
        return report;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        
        // 진행 상황 파일 정리 (완료시)
        if (this.progress.currentIndex >= this.progress.totalTarget) {
            try {
                await fs.unlink(this.progressFile);
                console.log('진행 상황 파일 정리 완료');
            } catch (error) {
                // 파일이 없어도 상관없음
            }
        }
    }
}

// 메인 실행 함수
async function main() {
    const collector = new MissingImageCollector();
    
    try {
        console.log('====== 대표이미지 누락 상품 수집 시스템 시작 ======');
        console.log('Phase 6 준비: 완벽한 이미지 완성도를 위한 최종 수집\n');
        
        await collector.init();
        const results = await collector.executeMissingImageCollection();
        
        console.log('\n====== 수집 작업 완료 ======');
        console.log('Phase 6 최종 검증 준비 완료!');
        
        return results;
        
    } catch (error) {
        console.error('수집 작업 중 오류:', error);
        throw error;
    } finally {
        await collector.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = MissingImageCollector;