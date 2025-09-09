const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class ImprovedCompleteGapFiller779 {
    constructor() {
        this.baseUrl = 'https://lucidshop.kr';
        this.finalImagePath = './final_image_v2';
        this.finalDataPath = './final_data';
        this.progressFile = './improved_gap_779_progress.json';
        
        this.browser = null;
        this.page = null;
        
        // 수집 대상 목록
        this.dataOnlyTargets = [];     // 726개: 완전 누락 (폴더 자체 없음)
        this.missingImageTargets = []; // 53개: 대표이미지만 누락
        this.allTargets = [];          // 779개: 전체 수집 대상
        
        this.results = [];
        
        this.progress = {
            currentPhase: 'loading_targets',
            currentIndex: 0,
            totalTarget: 779,
            successCount: 0,
            failedCount: 0,
            startTime: Date.now(),
            completedItems: [],
            failedItems: []
        };
        
        this.stats = {
            totalAttempted: 0,
            dataOnlySuccess: 0,
            missingImageSuccess: 0,
            imageDownloaded: 0,
            folderCreated: 0,
            searchSuccessful: 0,
            searchFailed: 0,
            representativeImages: 0,
            detailImages: 0
        };
        
        console.log('개선된 완전 갭 필러 시스템 초기화 (정확한 이미지 추출)...');
    }

    async init() {
        await this.loadAllTargets();
        await this.loadProgress();
        
        console.log('개선된 완전 갭 필러 시스템 초기화 완료');
        console.log(`총 수집 대상: ${this.allTargets.length}개`);
        console.log(`  - 완전 누락: ${this.dataOnlyTargets.length}개`);
        console.log(`  - 대표이미지만 누락: ${this.missingImageTargets.length}개`);
        console.log(`진행률: ${this.progress.currentIndex}/${this.progress.totalTarget}\n`);
        
        return this;
    }

    async loadAllTargets() {
        try {
            console.log('수집 대상 로드 중...');
            
            const syncReport = JSON.parse(await fs.readFile('./improved_sync_verification_report.json', 'utf8'));
            
            // dataOnly 목록 (726개)
            if (syncReport.syncDetails && syncReport.syncDetails.dataOnly) {
                console.log(`   dataOnly 대상: ${syncReport.syncDetails.dataOnly.length}개 발견`);
                
                for (const dataOnlyItem of syncReport.syncDetails.dataOnly) {
                    const detailedInfo = await this.getDetailedProductInfo(dataOnlyItem);
                    if (detailedInfo) {
                        this.dataOnlyTargets.push({
                            ...detailedInfo,
                            targetType: 'data_only',
                            needsFolder: true,
                            needsRepresentativeImage: true
                        });
                    }
                }
            }
            
            // missingImages 목록 (53개)
            if (syncReport.syncDetails && syncReport.syncDetails.missingImages) {
                console.log(`   missingImages 대상: ${syncReport.syncDetails.missingImages.length}개 발견`);
                
                for (const missingImageItem of syncReport.syncDetails.missingImages) {
                    this.missingImageTargets.push({
                        ...missingImageItem,
                        targetType: 'missing_image',
                        needsFolder: false,
                        needsRepresentativeImage: true
                    });
                }
            }
            
            this.allTargets = [...this.dataOnlyTargets, ...this.missingImageTargets];
            this.progress.totalTarget = this.allTargets.length;
            
            console.log(`   총 수집 대상: ${this.allTargets.length}개 로드 완료`);
            console.log(`     - 완전 누락 (dataOnly): ${this.dataOnlyTargets.length}개`);
            console.log(`     - 대표이미지 누락: ${this.missingImageTargets.length}개\n`);
            
        } catch (error) {
            console.error('수집 대상 로드 오류:', error.message);
            throw error;
        }
    }

    async getDetailedProductInfo(productData) {
        try {
            const categoryName = productData.category || productData.categoryName;
            if (!categoryName) return null;
            
            const categoryFile = path.join(this.finalDataPath, `${categoryName}_products.json`);
            const categoryData = JSON.parse(await fs.readFile(categoryFile, 'utf8'));
            
            let products = [];
            if (Array.isArray(categoryData)) {
                products = categoryData;
            } else if (categoryData.products && Array.isArray(categoryData.products)) {
                products = categoryData.products;
            }
            
            const targetProduct = products.find(product => {
                if (productData.productName) {
                    return this.normalizeText(product.productName || product.originalProductName || '') === 
                           this.normalizeText(productData.productName);
                }
                if (productData.originalProductName) {
                    return this.normalizeText(product.productName || product.originalProductName || '') === 
                           this.normalizeText(productData.originalProductName);
                }
                return false;
            });
            
            if (targetProduct) {
                return {
                    category: categoryName,
                    brand: targetProduct.brandName || productData.brandName || 'Unknown',
                    productName: targetProduct.productName || targetProduct.originalProductName,
                    originalProductName: targetProduct.originalProductName || targetProduct.productName,
                    imageUrl: targetProduct.imageUrl,
                    detailUrl: targetProduct.detailUrl,
                    currentPrice: targetProduct.currentPrice,
                    savedImageName: targetProduct.savedImageName,
                    sourceData: targetProduct
                };
            }
            
            return null;
            
        } catch (error) {
            console.log(`   카테고리 ${productData.category} 정보 로드 실패: ${error.message}`);
            return null;
        }
    }

    async loadProgress() {
        try {
            const progressData = await fs.readFile(this.progressFile, 'utf8');
            const savedProgress = JSON.parse(progressData);
            this.progress = { ...this.progress, ...savedProgress };
            
            console.log('이전 진행 상황 로드됨:');
            console.log(`   현재 진행: ${this.progress.currentIndex}/${this.progress.totalTarget}`);
            console.log(`   성공: ${this.progress.successCount}개`);
            console.log(`   실패: ${this.progress.failedCount}개\n`);
            
        } catch (error) {
            console.log('새로운 개선된 갭 필링 작업 시작\n');
        }
    }

    async saveProgress() {
        this.progress.lastSaveTime = new Date().toISOString();
        this.progress.totalElapsedTime = Date.now() - this.progress.startTime;
        
        await fs.writeFile(this.progressFile, JSON.stringify(this.progress, null, 2));
    }

    async executeCompleteGapFilling() {
        console.log('====== 개선된 완전 갭 필링 시작 (정확한 이미지 추출) ======\n');
        
        if (this.allTargets.length === 0) {
            console.log('수집할 상품이 없습니다!');
            return { success: true, message: '모든 상품이 완성되었습니다.' };
        }
        
        if (this.progress.currentPhase === 'loading_targets') {
            this.progress.currentPhase = 'collection_in_progress';
        }
        
        const startIndex = this.progress.currentIndex;
        const itemsToProcess = this.allTargets.slice(startIndex);
        
        console.log(`수집 시작: ${itemsToProcess.length}개 (전체 ${this.allTargets.length}개 중 ${startIndex + 1}번째부터)`);
        
        for (let i = 0; i < itemsToProcess.length; i++) {
            const currentIndex = startIndex + i;
            const target = itemsToProcess[i];
            
            console.log(`\n[${currentIndex + 1}/${this.allTargets.length}] ${target.targetType} 처리 중...`);
            console.log(`대상: [${target.category}/${target.brand}] ${target.productName || target.originalProductName}`);
            
            try {
                this.stats.totalAttempted++;
                
                let success = false;
                
                if (target.targetType === 'data_only') {
                    success = await this.processDataOnlyTargetImproved(target);
                    if (success) this.stats.dataOnlySuccess++;
                    
                } else if (target.targetType === 'missing_image') {
                    success = await this.processMissingImageTargetImproved(target);
                    if (success) this.stats.missingImageSuccess++;
                }
                
                if (success) {
                    console.log(`   ✅ 성공`);
                    this.progress.successCount++;
                    this.progress.completedItems.push({
                        ...target,
                        completedAt: new Date().toISOString()
                    });
                    this.stats.searchSuccessful++;
                } else {
                    throw new Error('처리 실패');
                }
                
            } catch (error) {
                console.log(`   ❌ 실패: ${error.message}`);
                
                this.progress.failedCount++;
                this.progress.failedItems.push({
                    ...target,
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
                this.stats.searchFailed++;
            }
            
            this.progress.currentIndex = currentIndex + 1;
            
            if ((i + 1) % 10 === 0) {
                await this.saveProgress();
                console.log(`   💾 진행 상황 저장됨 (${this.progress.currentIndex}/${this.progress.totalTarget})`);
            }
            
            await this.delay(2000);
        }
        
        this.progress.currentPhase = 'completed';
        await this.saveProgress();
        
        const finalReport = await this.generateFinalReport();
        
        console.log('\n====== 개선된 완전 갭 필링 완료 ======');
        
        return finalReport;
    }

    // 핵심: 개선된 데이터 전용 타겟 처리
    async processDataOnlyTargetImproved(target) {
        try {
            console.log(`   정확한 이미지 추출 방식으로 수집 시작...`);
            
            if (!target.detailUrl) {
                throw new Error('detailUrl이 없음');
            }
            
            console.log(`   상세 페이지 접근: ${target.detailUrl}`);
            
            const imageUrls = await this.extractImagesFromDetailPageImproved(target.detailUrl);
            
            if (imageUrls.length === 0) {
                throw new Error('상세 페이지에서 유효한 이미지를 찾을 수 없음');
            }
            
            console.log(`   추출된 유효 이미지: ${imageUrls.length}개`);
            
            // 폴더 생성 및 이미지 다운로드
            let successCount = 0;
            for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];
                const imageType = i === 0 ? '대표' : '상세';
                
                const downloadResult = await this.downloadAndSaveImageImproved(
                    imageUrl,
                    target.category,
                    target.brand,
                    target.productName || target.originalProductName,
                    imageType,
                    i + 1
                );
                
                if (downloadResult.success) {
                    successCount++;
                    console.log(`     ${imageType} 이미지 ${i + 1} 저장 성공 (${(downloadResult.fileSize / 1024).toFixed(1)}KB)`);
                    
                    if (imageType === '대표') {
                        this.stats.representativeImages++;
                    } else {
                        this.stats.detailImages++;
                    }
                } else {
                    console.log(`     ${imageType} 이미지 ${i + 1} 저장 실패: ${downloadResult.error}`);
                }
                
                await this.delay(500);
            }
            
            if (successCount > 0) {
                this.results.push({
                    ...target,
                    totalImages: imageUrls.length,
                    downloadedImages: successCount,
                    method: 'improved_selective_extraction',
                    status: 'success',
                    collectionTime: new Date().toISOString()
                });
                
                this.stats.imageDownloaded += successCount;
                return true;
            } else {
                throw new Error(`모든 이미지 다운로드 실패 (${imageUrls.length}개 시도)`);
            }
            
        } catch (error) {
            console.log(`   dataOnly 처리 오류: ${error.message}`);
            return false;
        }
    }

    async processMissingImageTargetImproved(target) {
        try {
            console.log(`   정확한 대표이미지 추출...`);
            
            let detailUrl = target.detailUrl;
            if (!detailUrl && target.sourceData && target.sourceData.detailUrl) {
                detailUrl = target.sourceData.detailUrl;
            }
            
            if (!detailUrl) {
                throw new Error('detailUrl을 찾을 수 없음');
            }
            
            console.log(`   상세 페이지 접근: ${detailUrl}`);
            
            const imageUrls = await this.extractImagesFromDetailPageImproved(detailUrl);
            
            if (imageUrls.length === 0) {
                throw new Error('상세 페이지에서 대표이미지를 찾을 수 없음');
            }
            
            // 첫 번째 이미지만 대표이미지로 사용
            const representativeImageUrl = imageUrls[0];
            
            const downloadResult = await this.downloadAndSaveImageImproved(
                representativeImageUrl,
                target.category,
                target.brand,
                target.productName,
                '대표',
                1
            );
            
            if (downloadResult.success) {
                this.results.push({
                    ...target,
                    originalImageUrl: representativeImageUrl,
                    savedImageName: downloadResult.fileName,
                    savedPath: downloadResult.savedPath,
                    method: 'improved_selective_extraction',
                    status: 'success',
                    collectionTime: new Date().toISOString()
                });
                
                this.stats.imageDownloaded++;
                this.stats.representativeImages++;
                return true;
            } else {
                throw new Error(`대표이미지 다운로드 실패: ${downloadResult.error}`);
            }
            
        } catch (error) {
            console.log(`   missingImage 처리 오류: ${error.message}`);
            return false;
        }
    }

    // 핵심: 개선된 이미지 추출 메서드 (정확한 타겟팅)
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
            
            // 2. 상세이미지 추출 (sit_inf_explan 영역)
            const detailImageRegex = /<div[^>]*id="sit_inf_explan"[^>]*>(.*?)<\/div>/gis;
            const detailMatch = detailImageRegex.exec(html);
            
            if (detailMatch) {
                const detailHtml = detailMatch[1];
                const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
                let imgMatch;
                
                while ((imgMatch = imgRegex.exec(detailHtml)) !== null) {
                    const src = imgMatch[1];
                    const normalizedUrl = this.normalizeImageUrl(src);
                    
                    if (this.isValidProductImage(normalizedUrl) && !imageUrls.includes(normalizedUrl)) {
                        imageUrls.push(normalizedUrl);
                        console.log(`     상세이미지 발견: ${normalizedUrl}`);
                    }
                }
            }
            
            // 3. 백업: 대표이미지가 없는 경우 thumb 이미지 찾기
            if (imageUrls.length === 0) {
                console.log(`     주요 이미지 영역에서 이미지를 찾을 수 없음, 백업 방식 사용...`);
                
                const backupImageRegex = /<img[^>]*src=["']([^"']*(?:data\/item|thumb)[^"']*)["'][^>]*>/gi;
                let backupMatch;
                
                while ((backupMatch = backupImageRegex.exec(html)) !== null) {
                    const src = backupMatch[1];
                    const normalizedUrl = this.normalizeImageUrl(src);
                    
                    if (this.isValidProductImage(normalizedUrl) && !imageUrls.includes(normalizedUrl)) {
                        imageUrls.push(normalizedUrl);
                        if (imageUrls.length >= 5) break; // 최대 5개까지만
                    }
                }
            }
            
            console.log(`     정제된 이미지 추출 완료: ${imageUrls.length}개 (대표: 1개, 상세: ${Math.max(0, imageUrls.length - 1)}개)`);
            return imageUrls;
            
        } catch (error) {
            console.log(`     상세 페이지 접근 오류: ${error.message}`);
            return [];
        }
    }

    // 상품 이미지인지 더 엄격하게 검증하는 메서드
    isValidProductImage(url) {
        if (!url || typeof url !== 'string') return false;
        
        // 기본 URL 검증
        if (!url.includes('http')) return false;
        
        // 제외할 이미지들 (아이콘, 소셜미디어, UI 요소들)
        const excludePatterns = [
            'facebook.png', 'twitter.png', 'instagram.png',
            'icon_', 'ico_', 'btn_', 'logo_', 'banner_',
            'bullet', 'arrow', 'star', 'heart',
            'kakao', 'naver', 'google',
            'common/', 'skin/', 'theme/',
            'width="1"', 'height="1"', // 추적 픽셀
            '.gif', // GIF 애니메이션 제외 (보통 UI 요소)
            'spacer', 'blank', 'transparent'
        ];
        
        for (const pattern of excludePatterns) {
            if (url.toLowerCase().includes(pattern.toLowerCase())) {
                return false;
            }
        }
        
        // 포함되어야 할 패턴들 (상품 이미지 경로)
        const includePatterns = [
            'data/item',     // 상품 이미지 기본 경로
            'data/editor',   // 에디터로 업로드된 상세 이미지
            'thumb',         // 썸네일 이미지
            'trendell.store' // 외부 이미지 서버
        ];
        
        const hasValidPattern = includePatterns.some(pattern => 
            url.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (!hasValidPattern) return false;
        
        // 이미지 확장자 검증
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const hasValidExtension = imageExtensions.some(ext => 
            url.toLowerCase().includes(ext)
        );
        
        // 확장자가 없어도 data/ 경로면 허용 (동적 이미지)
        if (!hasValidExtension && !url.includes('data/')) return false;
        
        return true;
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
        
        // IP 주소를 도메인으로 변환
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

    async downloadAndSaveImageImproved(imageUrl, category, brand, productName, imageType, imageIndex) {
        try {
            if (!this.isValidProductImage(imageUrl)) {
                throw new Error('유효하지 않은 이미지 URL');
            }
            
            console.log(`       ${imageType} 이미지 다운로드: ${imageUrl}`);
            
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
            
            let fileName;
            if (imageType === '대표') {
                fileName = `${cleanProductName}_${timestamp}(대표)${extension}`;
            } else {
                fileName = `${imageType}${imageIndex}_${cleanProductName}_${timestamp}${extension}`;
            }
            
            const targetDir = path.join(this.finalImagePath, category, brand, productName);
            
            try {
                await fs.access(targetDir);
            } catch {
                await fs.mkdir(targetDir, { recursive: true });
                this.stats.folderCreated++;
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

    async generateFinalReport() {
        const report = {
            completionDateTime: new Date().toISOString(),
            method: 'improved_selective_image_extraction',
            version: '2.0',
            improvements: [
                '정확한 대표이미지 추출 (sit_pvi_big 영역)',
                '정확한 상세이미지 추출 (sit_inf_explan 영역)',
                '엄격한 이미지 검증 (UI 요소 제외)',
                '불필요한 이미지 다운로드 방지'
            ],
            totalTargets: this.allTargets.length,
            targetBreakdown: {
                dataOnly: this.dataOnlyTargets.length,
                missingImages: this.missingImageTargets.length
            },
            results: {
                totalAttempted: this.stats.totalAttempted,
                successCount: this.progress.successCount,
                failedCount: this.progress.failedCount,
                successRate: this.stats.totalAttempted > 0 ? 
                    ((this.progress.successCount / this.stats.totalAttempted) * 100).toFixed(1) + '%' : '0%'
            },
            detailedStats: {
                dataOnlySuccess: this.stats.dataOnlySuccess,
                missingImageSuccess: this.stats.missingImageSuccess,
                totalImageDownloaded: this.stats.imageDownloaded,
                representativeImages: this.stats.representativeImages,
                detailImages: this.stats.detailImages,
                folderCreated: this.stats.folderCreated,
                searchSuccessful: this.stats.searchSuccessful,
                searchFailed: this.stats.searchFailed
            },
            collectedItems: this.results,
            failedItems: this.progress.failedItems,
            finalProjection: {
                originalTotal: 24216,
                beforeCollection: 23488,
                afterCollection: 23488 + this.progress.successCount,
                remainingGap: Math.max(0, 24216 - (23488 + this.progress.successCount)),
                completionRate: (((23488 + this.progress.successCount) / 24216) * 100).toFixed(1) + '%'
            },
            elapsedTime: {
                totalMinutes: ((Date.now() - this.progress.startTime) / 1000 / 60).toFixed(1),
                averagePerItem: this.stats.totalAttempted > 0 ?
                    (((Date.now() - this.progress.startTime) / 1000) / this.stats.totalAttempted).toFixed(1) + 's' : '0s'
            }
        };
        
        await fs.writeFile('./improved_gap_779_report.json', JSON.stringify(report, null, 2));
        
        console.log('\n📊 === 개선된 갭 필링 완료 보고서 ===');
        console.log(`총 대상: ${report.totalTargets}개 (dataOnly: ${report.targetBreakdown.dataOnly}, missingImages: ${report.targetBreakdown.missingImages})`);
        console.log(`수집 성공: ${report.results.successCount}개 (${report.results.successRate})`);
        console.log(`수집 실패: ${report.results.failedCount}개`);
        console.log(`폴더 생성: ${report.detailedStats.folderCreated}개`);
        console.log(`이미지 다운로드: ${report.detailedStats.totalImageDownloaded}개`);
        console.log(`  - 대표이미지: ${report.detailedStats.representativeImages}개`);
        console.log(`  - 상세이미지: ${report.detailedStats.detailImages}개`);
        console.log(`프로젝트 완성률: ${report.finalProjection.completionRate} (${report.finalProjection.afterCollection}/${report.finalProjection.originalTotal})`);
        console.log(`남은 갭: ${report.finalProjection.remainingGap}개`);
        console.log(`소요 시간: ${report.elapsedTime.totalMinutes}분`);
        console.log(`수집 방식: 개선된 선택적 이미지 추출 (v2.0)`);
        
        if (report.results.failedCount > 0) {
            console.log('\n❌ 실패 항목 (상위 5개):');
            this.progress.failedItems.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. [${item.category}/${item.brand}] ${item.productName || item.originalProductName}`);
                console.log(`   └─ ${item.error}`);
            });
        }
        
        console.log(`\n💾 상세 보고서: improved_gap_779_report.json`);
        
        return report;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
        
        if (this.progress.currentPhase === 'completed') {
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
    const gapFiller = new ImprovedCompleteGapFiller779();
    
    try {
        console.log('====== 개선된 완전 갭 필링 시스템 시작 ======');
        console.log('개선사항: 정확한 이미지 추출, 불필요한 다운로드 방지\n');
        
        await gapFiller.init();
        const results = await gapFiller.executeCompleteGapFilling();
        
        console.log('\n====== 개선된 갭 필링 완료 ======');
        console.log('정확한 이미지 추출 방식으로 효율적인 수집 완료!');
        
        return results;
        
    } catch (error) {
        console.error('개선된 갭 필링 중 오류:', error);
        throw error;
    } finally {
        await gapFiller.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ImprovedCompleteGapFiller779;