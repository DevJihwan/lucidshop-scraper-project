const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class EnhancedFailedItemsRecoveryScript {
    constructor() {
        this.baseUrl = 'https://lucidshop.kr';
        this.finalImagePath = './final_image_v2';
        this.finalDataPath = './final_data';
        this.progressFile = './enhanced_failed_recovery_progress.json';
        
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
            downloadFailed: 0,
            matchingAttempts: {
                exactMatch: 0,
                normalizedMatch: 0,
                partialMatch: 0,
                idExtraction: 0,
                crossCategoryMatch: 0
            }
        };
        
        console.log('향상된 실패 항목 복구 스크립트 초기화 (매칭 문제 해결)...');
    }

    async init() {
        await this.loadFailedItems();
        await this.loadProgress();
        
        console.log('향상된 복구 스크립트 초기화 완료');
        console.log(`복구 대상: ${this.failedItems.length}개`);
        console.log(`진행률: ${this.progress.currentIndex}/${this.progress.totalItems}\n`);
        
        return this;
    }

    async loadFailedItems() {
        try {
            console.log('실패 항목 로드 중...');
            
            const reportData = JSON.parse(await fs.readFile('./improved_gap_779_report.json', 'utf8'));
            
            if (reportData.failedItems && reportData.failedItems.length > 0) {
                this.failedItems = reportData.failedItems.map(item => {
                    // savedImageName 정보 추가 분석
                    const enhancedItem = { ...item };
                    
                    if (item.savedImageName) {
                        enhancedItem.parsedInfo = this.parseSavedImageName(item.savedImageName);
                    }
                    
                    return enhancedItem;
                });
                
                this.progress.totalItems = this.failedItems.length;
                
                console.log(`   실패 항목 ${this.failedItems.length}개 로드됨`);
                
                // 파싱된 정보 출력 (디버깅용)
                console.log('\n   파싱된 정보 샘플:');
                this.failedItems.slice(0, 3).forEach((item, index) => {
                    console.log(`   ${index + 1}. 원본: ${item.productName || item.originalProductName}`);
                    if (item.parsedInfo) {
                        console.log(`      파싱: ${JSON.stringify(item.parsedInfo, null, 2)}`);
                    }
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

    // savedImageName 파싱 메서드
    parseSavedImageName(savedImageName) {
        if (!savedImageName) return null;
        
        try {
            // 예: "가방_고야드 19FW 트렁크 스트랩백 그레이_18791(대표).jpg"
            const cleanName = savedImageName.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
            
            // 카테고리_브랜드 상품명_ID(타입) 패턴 분석
            const patterns = [
                // 패턴 1: 카테고리_브랜드 상품명_ID(타입)
                /^([^_]+)_(.+)_(\d+)\(([^)]+)\)$/,
                // 패턴 2: 카테고리_상품명_ID(타입)
                /^([^_]+)_(.+)_(\d+)\(([^)]+)\)$/,
                // 패턴 3: 상품명_ID(타입)
                /^(.+)_(\d+)\(([^)]+)\)$/
            ];
            
            for (const pattern of patterns) {
                const match = cleanName.match(pattern);
                if (match) {
                    let category, productName, id, type;
                    
                    if (match.length === 5) {
                        // 카테고리_브랜드/상품명_ID(타입)
                        [, category, productName, id, type] = match;
                    } else if (match.length === 4) {
                        // 상품명_ID(타입)
                        [, productName, id, type] = match;
                    }
                    
                    return {
                        originalFileName: savedImageName,
                        category: category || null,
                        productName: productName ? productName.trim() : null,
                        extractedId: id,
                        imageType: type,
                        // 추가 분석
                        normalizedProductName: this.advancedNormalizeText(productName || ''),
                        brandFromProductName: this.extractBrandFromProductName(productName || ''),
                        possibleIds: this.extractAllIds(savedImageName)
                    };
                }
            }
            
            // 패턴 매칭 실패시 ID만 추출
            const allIds = this.extractAllIds(savedImageName);
            return {
                originalFileName: savedImageName,
                productName: cleanName,
                normalizedProductName: this.advancedNormalizeText(cleanName),
                possibleIds: allIds,
                extractedId: allIds[0] || null
            };
            
        } catch (error) {
            console.log(`   savedImageName 파싱 오류: ${error.message}`);
            return null;
        }
    }

    // 모든 ID 추출
    extractAllIds(text) {
        const ids = [];
        const matches = text.match(/\d{4,}/g);
        if (matches) {
            // 길이별로 정렬 (긴 것부터 - 더 구체적인 ID일 가능성)
            matches.sort((a, b) => b.length - a.length);
            ids.push(...matches);
        }
        return [...new Set(ids)]; // 중복 제거
    }

    // 상품명에서 브랜드 추출
    extractBrandFromProductName(productName) {
        const brandKeywords = [
            '고야드', '디올', '구찌', '루이비통', '샤넬', '에르메스', '프라다', '발렌시아가',
            '펜디', '보테가베네타', '생로랑', '지방시', '막스마라', '몽클레어', '버버리',
            '티파니', '까르띠에', '불가리', '반클리프', '쇼파드'
        ];
        
        for (const brand of brandKeywords) {
            if (productName.includes(brand)) {
                return brand;
            }
        }
        return null;
    }

    // 향상된 텍스트 정규화
    advancedNormalizeText(text) {
        return (text || '')
            .toLowerCase()
            .replace(/[<>:"/\\|?*\[\]()]/g, '')
            .replace(/[-_\s]+/g, ' ')
            .replace(/앤/g, '&')
            .replace(/\s+/g, ' ')
            .trim();
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
            console.log('새로운 향상된 복구 작업 시작\n');
        }
    }

    async saveProgress() {
        this.progress.lastSaveTime = new Date().toISOString();
        this.progress.totalElapsedTime = Date.now() - this.progress.startTime;
        
        await fs.writeFile(this.progressFile, JSON.stringify(this.progress, null, 2));
    }

    async executeRecovery() {
        console.log('====== 향상된 실패 항목 복구 시작 ======\n');
        
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
            if (failedItem.parsedInfo) {
                console.log(`파싱된 상품명: "${failedItem.parsedInfo.productName}"`);
                console.log(`추출된 ID: ${failedItem.parsedInfo.possibleIds?.join(', ')}`);
            }
            
            try {
                this.stats.totalAttempted++;
                
                const success = await this.recoverSingleItemEnhanced(failedItem);
                
                if (success) {
                    console.log(`   ✅ 복구 성공`);
                    this.progress.successCount++;
                    this.recoveredItems.push({
                        ...failedItem,
                        recoveredAt: new Date().toISOString(),
                        recoveryMethod: 'enhanced_matching_system'
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
        
        console.log('\n====== 향상된 실패 항목 복구 완료 ======');
        
        return finalReport;
    }

    async recoverSingleItemEnhanced(failedItem) {
        try {
            console.log(`   향상된 매칭 시스템으로 detailUrl 검색...`);
            
            // 단계별 detailUrl 검색
            const detailUrl = await this.findDetailUrlEnhancedMatching(failedItem);
            
            if (!detailUrl) {
                this.stats.detailUrlNotFound++;
                throw new Error('향상된 매칭으로도 detailUrl을 찾을 수 없음');
            }
            
            this.stats.detailUrlFound++;
            console.log(`   detailUrl 발견: ${detailUrl}`);
            
            // 이미지 추출
            const imageUrls = await this.extractImagesFromDetailPageImproved(detailUrl);
            
            if (imageUrls.length === 0) {
                throw new Error('상세 페이지에서 대표이미지를 찾을 수 없음');
            }
            
            console.log(`   추출된 이미지: ${imageUrls.length}개`);
            
            // 대표이미지 다운로드
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

    // 향상된 매칭 시스템
    async findDetailUrlEnhancedMatching(failedItem) {
        const searchMethods = [
            { name: 'exactMatch', method: () => this.findByExactMatch(failedItem) },
            { name: 'parsedMatch', method: () => this.findByParsedInfo(failedItem) },
            { name: 'normalizedMatch', method: () => this.findByNormalizedMatch(failedItem) },
            { name: 'partialMatch', method: () => this.findByPartialMatch(failedItem) },
            { name: 'idExtraction', method: () => this.findByIdExtraction(failedItem) },
            { name: 'crossCategory', method: () => this.findByCrossCategory(failedItem) },
            { name: 'brandMatch', method: () => this.findByBrandMatch(failedItem) }
        ];
        
        for (const { name, method } of searchMethods) {
            try {
                console.log(`     시도 중: ${name}`);
                const detailUrl = await method();
                if (detailUrl) {
                    console.log(`     ✅ ${name} 성공`);
                    this.stats.matchingAttempts[name] = (this.stats.matchingAttempts[name] || 0) + 1;
                    return detailUrl;
                }
            } catch (error) {
                console.log(`     ❌ ${name} 실패: ${error.message}`);
            }
        }
        
        return null;
    }

    // 방법 1: 정확한 매칭
    async findByExactMatch(failedItem) {
        if (failedItem.detailUrl) {
            return failedItem.detailUrl;
        }
        
        if (failedItem.sourceData && failedItem.sourceData.detailUrl) {
            return failedItem.sourceData.detailUrl;
        }
        
        return null;
    }

    // 방법 2: 파싱된 정보로 매칭
    async findByParsedInfo(failedItem) {
        if (!failedItem.parsedInfo || !failedItem.parsedInfo.productName) {
            return null;
        }
        
        const parsedProductName = failedItem.parsedInfo.productName;
        const category = failedItem.category;
        
        try {
            const categoryFile = path.join(this.finalDataPath, `${category}_products.json`);
            const categoryData = JSON.parse(await fs.readFile(categoryFile, 'utf8'));
            
            let products = Array.isArray(categoryData) ? categoryData : categoryData.products || [];
            
            // 파싱된 상품명으로 정확 매칭
            const exactMatch = products.find(product => {
                const productName = product.productName || product.originalProductName || '';
                return this.advancedNormalizeText(productName) === this.advancedNormalizeText(parsedProductName);
            });
            
            if (exactMatch && exactMatch.detailUrl) {
                return exactMatch.detailUrl;
            }
            
            // 파싱된 상품명으로 부분 매칭
            const partialMatch = products.find(product => {
                const productName = product.productName || product.originalProductName || '';
                const normalizedProduct = this.advancedNormalizeText(productName);
                const normalizedParsed = this.advancedNormalizeText(parsedProductName);
                
                return normalizedProduct.includes(normalizedParsed.substring(0, Math.min(normalizedParsed.length, 10))) ||
                       normalizedParsed.includes(normalizedProduct.substring(0, Math.min(normalizedProduct.length, 10)));
            });
            
            if (partialMatch && partialMatch.detailUrl) {
                return partialMatch.detailUrl;
            }
            
        } catch (error) {
            // 파일이 없거나 파싱 오류
        }
        
        return null;
    }

    // 방법 3: 정규화된 매칭
    async findByNormalizedMatch(failedItem) {
        const searchName = failedItem.productName || failedItem.originalProductName;
        if (!searchName) return null;
        
        const normalizedSearchName = this.advancedNormalizeText(searchName.replace(/\(대표\)$/, '').trim());
        const category = failedItem.category;
        
        try {
            const categoryFile = path.join(this.finalDataPath, `${category}_products.json`);
            const categoryData = JSON.parse(await fs.readFile(categoryFile, 'utf8'));
            
            let products = Array.isArray(categoryData) ? categoryData : categoryData.products || [];
            
            const match = products.find(product => {
                const productName = product.productName || product.originalProductName || '';
                const normalizedProduct = this.advancedNormalizeText(productName);
                
                return normalizedProduct === normalizedSearchName ||
                       normalizedProduct.includes(normalizedSearchName) ||
                       normalizedSearchName.includes(normalizedProduct);
            });
            
            return match && match.detailUrl ? match.detailUrl : null;
            
        } catch (error) {
            return null;
        }
    }

    // 방법 4: 부분 매칭 (키워드 기반)
    async findByPartialMatch(failedItem) {
        const searchName = failedItem.productName || failedItem.originalProductName;
        if (!searchName) return null;
        
        // 키워드 추출 (브랜드, 주요 단어)
        const keywords = this.extractKeywords(searchName);
        if (keywords.length === 0) return null;
        
        const category = failedItem.category;
        
        try {
            const categoryFile = path.join(this.finalDataPath, `${category}_products.json`);
            const categoryData = JSON.parse(await fs.readFile(categoryFile, 'utf8'));
            
            let products = Array.isArray(categoryData) ? categoryData : categoryData.products || [];
            
            // 키워드 기반 매칭
            const match = products.find(product => {
                const productName = product.productName || product.originalProductName || '';
                const normalizedProduct = this.advancedNormalizeText(productName);
                
                // 모든 키워드가 포함되어야 함
                return keywords.every(keyword => 
                    normalizedProduct.includes(this.advancedNormalizeText(keyword))
                );
            });
            
            return match && match.detailUrl ? match.detailUrl : null;
            
        } catch (error) {
            return null;
        }
    }

    // 방법 5: ID 추출로 직접 URL 구성
    async findByIdExtraction(failedItem) {
        const possibleIds = failedItem.parsedInfo?.possibleIds || 
                           this.extractAllIds(failedItem.savedImageName || '') ||
                           this.extractAllIds(failedItem.productName || '');
        
        if (!possibleIds || possibleIds.length === 0) return null;
        
        // ID 유효성 검사 및 URL 구성
        for (const id of possibleIds) {
            if (id && id.length >= 10) { // 10자리 이상 ID
                const detailUrl = `https://lucidshop.kr/shop/item.php?it_id=${id}`;
                
                try {
                    const response = await axios.head(detailUrl, { 
                        timeout: 5000,
                        validateStatus: function (status) {
                            return status === 200;
                        }
                    });
                    
                    if (response.status === 200) {
                        console.log(`     ID ${id}로 유효한 URL 발견`);
                        return detailUrl;
                    }
                } catch (error) {
                    // 다음 ID 시도
                    continue;
                }
            }
        }
        
        return null;
    }

    // 방법 6: 다른 카테고리에서 검색
    async findByCrossCategory(failedItem) {
        const searchName = failedItem.productName || failedItem.originalProductName;
        if (!searchName) return null;
        
        const normalizedSearchName = this.advancedNormalizeText(searchName.replace(/\(대표\)$/, '').trim());
        
        try {
            const dataFiles = await fs.readdir(this.finalDataPath);
            const categoryFiles = dataFiles.filter(file => file.endsWith('_products.json'));
            
            for (const categoryFile of categoryFiles) {
                try {
                    const categoryData = JSON.parse(await fs.readFile(path.join(this.finalDataPath, categoryFile), 'utf8'));
                    let products = Array.isArray(categoryData) ? categoryData : categoryData.products || [];
                    
                    const match = products.find(product => {
                        const productName = product.productName || product.originalProductName || '';
                        const normalizedProduct = this.advancedNormalizeText(productName);
                        
                        return normalizedProduct === normalizedSearchName ||
                               (normalizedProduct.length > 10 && normalizedSearchName.length > 10 && 
                                (normalizedProduct.includes(normalizedSearchName.substring(0, 15)) ||
                                 normalizedSearchName.includes(normalizedProduct.substring(0, 15))));
                    });
                    
                    if (match && match.detailUrl) {
                        console.log(`     다른 카테고리 ${categoryFile}에서 발견`);
                        return match.detailUrl;
                    }
                    
                } catch (error) {
                    continue;
                }
            }
            
        } catch (error) {
            return null;
        }
        
        return null;
    }

    // 방법 7: 브랜드 기반 매칭
    async findByBrandMatch(failedItem) {
        const brand = failedItem.brand || failedItem.parsedInfo?.brandFromProductName;
        if (!brand) return null;
        
        const searchName = failedItem.productName || failedItem.originalProductName;
        if (!searchName) return null;
        
        const category = failedItem.category;
        
        try {
            const categoryFile = path.join(this.finalDataPath, `${category}_products.json`);
            const categoryData = JSON.parse(await fs.readFile(categoryFile, 'utf8'));
            
            let products = Array.isArray(categoryData) ? categoryData : categoryData.products || [];
            
            // 브랜드로 필터링 후 이름 매칭
            const brandProducts = products.filter(product => {
                const productBrand = product.brandName || '';
                return this.advancedNormalizeText(productBrand) === this.advancedNormalizeText(brand);
            });
            
            if (brandProducts.length > 0) {
                const normalizedSearchName = this.advancedNormalizeText(searchName);
                
                const match = brandProducts.find(product => {
                    const productName = product.productName || product.originalProductName || '';
                    const normalizedProduct = this.advancedNormalizeText(productName);
                    
                    return normalizedProduct.includes(normalizedSearchName.substring(0, 10)) ||
                           normalizedSearchName.includes(normalizedProduct.substring(0, 10));
                });
                
                if (match && match.detailUrl) {
                    return match.detailUrl;
                }
            }
            
        } catch (error) {
            return null;
        }
        
        return null;
    }

    // 키워드 추출
    extractKeywords(text) {
        const keywords = [];
        const normalizedText = this.advancedNormalizeText(text);
        
        // 브랜드 키워드
        const brands = ['고야드', '디올', '구찌', '루이비통', '샤넬', '에르메스', '프라다', '발렌시아가', '펜디', '보테가베네타', '생로랑', '지방시', '막스마라', '몽클레어', '버버리', '티파니', '까르띠에', '불가리', '반클리프', '쇼파드'];
        
        for (const brand of brands) {
            if (normalizedText.includes(this.advancedNormalizeText(brand))) {
                keywords.push(brand);
            }
        }
        
        // 중요한 단어 추출 (3글자 이상)
        const words = normalizedText.split(' ').filter(word => word.length >= 3);
        keywords.push(...words.slice(0, 3)); // 상위 3개 단어
        
        return [...new Set(keywords)]; // 중복 제거
    }

    // 이미지 추출 (기존 로직 재사용)
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
                        if (imageUrls.length >= 3) break;
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

    async generateRecoveryReport() {
        const report = {
            completionDateTime: new Date().toISOString(),
            method: 'enhanced_matching_system_recovery',
            version: '2.0',
            improvements: [
                'savedImageName 정확한 파싱',
                '7단계 매칭 시스템',
                '향상된 텍스트 정규화',
                'ID 추출 및 검증',
                '브랜드 기반 매칭',
                '크로스 카테고리 검색'
            ],
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
                downloadFailed: this.stats.downloadFailed,
                matchingAttempts: this.stats.matchingAttempts
            },
            recoveredItems: this.recoveredItems,
            finalFailedItems: this.finalFailedItems,
            elapsedTime: {
                totalMinutes: ((Date.now() - this.progress.startTime) / 1000 / 60).toFixed(1),
                averagePerItem: this.stats.totalAttempted > 0 ?
                    (((Date.now() - this.progress.startTime) / 1000) / this.stats.totalAttempted).toFixed(1) + 's' : '0s'
            }
        };
        
        await fs.writeFile('./enhanced_failed_recovery_report.json', JSON.stringify(report, null, 2));
        
        console.log('\n📊 === 향상된 복구 보고서 ===');
        console.log(`복구 대상: ${report.totalFailedItems}개`);
        console.log(`복구 성공: ${report.results.successCount}개 (${report.results.recoveryRate})`);
        console.log(`최종 실패: ${report.results.finalFailedCount}개`);
        console.log(`detailUrl 발견: ${report.detailedStats.detailUrlFound}개`);
        console.log(`이미지 다운로드: ${report.detailedStats.imageDownloaded}개`);
        console.log(`소요 시간: ${report.elapsedTime.totalMinutes}분`);
        
        console.log('\n매칭 방법별 성공률:');
        Object.entries(report.detailedStats.matchingAttempts).forEach(([method, count]) => {
            if (count > 0) {
                console.log(`  - ${method}: ${count}회 성공`);
            }
        });
        
        if (report.results.finalFailedCount > 0) {
            console.log('\n❌ 최종 실패 항목:');
            this.finalFailedItems.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. [${item.category}/${item.brand}] ${item.productName || item.originalProductName}`);
                console.log(`   └─ ${item.finalError}`);
            });
        }
        
        console.log(`\n💾 상세 보고서: enhanced_failed_recovery_report.json`);
        
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
    const recoveryScript = new EnhancedFailedItemsRecoveryScript();
    
    try {
        console.log('====== 향상된 실패 항목 복구 스크립트 시작 ======');
        console.log('7단계 향상된 매칭 시스템으로 53개 항목 복구\n');
        
        await recoveryScript.init();
        const results = await recoveryScript.executeRecovery();
        
        console.log('\n====== 향상된 실패 항목 복구 완료 ======');
        console.log('향상된 매칭 시스템으로 복구 작업 완료!');
        
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

module.exports = EnhancedFailedItemsRecoveryScript;