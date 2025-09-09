const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

class DetailImageCollector {
    constructor() {
        this.finalDataPath = './final_data';
        this.finalImagePath = './final_image_v2';
        this.progressFile = './detail_image_collection_progress.json';
        this.logFile = './detail_image_collection_log.txt';
        this.reportFile = './detail_image_collection_report.json';
        
        // HTTP 클라이언트 설정
        this.httpClient = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        
        this.progress = {
            currentCategory: '',
            currentCategoryIndex: 0,
            currentProductIndex: 0,
            totalCategories: 0,
            totalProducts: 0,
            processedProducts: 0,
            startTime: Date.now(),
            lastSaveTime: null,
            completed: false
        };
        
        this.stats = {
            totalProductsScanned: 0,
            productsNeedingDetails: 0,
            productsAlreadyHaveDetails: 0,
            productsWithSufficientImages: 0,  // 9개 이상 상세 이미지 보유 상품
            productsSkipped: 0,
            
            detailPagesVisited: 0,
            detailPagesFailed: 0,
            
            totalDetailImagesFound: 0,
            totalDetailImagesDownloaded: 0,
            totalDetailImagesFailed: 0,
            totalDetailImagesSkipped: 0,
            
            totalDownloadSize: 0,
            
            networkErrors: 0,
            parseErrors: 0,
            fileSystemErrors: 0,
            
            // 효율성 통계
            networkRequestsSaved: 0  // 9개 이상 보유로 절약된 네트워크 요청 수
        };
        
        this.results = {
            successful: [],
            failed: [],
            skipped: [],
            errors: []
        };
        
        // 카테고리별 제품 데이터
        this.productData = {};
        
        console.log('상세 이미지 수집 시스템 초기화...');
    }

    async init() {
        await this.loadProgress();
        await this.initializeLog();
        await this.loadProductData();
        
        console.log('상세 이미지 수집 시스템 초기화 완료');
        console.log(`데이터 소스: ${this.finalDataPath}`);
        console.log(`이미지 저장: ${this.finalImagePath}`);
        console.log(`총 상품: ${this.stats.totalProductsScanned}개`);
        console.log(`진행률: ${this.progress.currentCategoryIndex}/${this.progress.totalCategories} 카테고리\n`);
        
        return this;
    }

    async loadProgress() {
        try {
            const progressData = await fs.readFile(this.progressFile, 'utf8');
            const savedProgress = JSON.parse(progressData);
            this.progress = { ...this.progress, ...savedProgress };
            
            console.log('이전 진행 상황 로드됨:');
            console.log(`   현재 카테고리: ${this.progress.currentCategory || '시작 전'}`);
            console.log(`   처리된 상품: ${this.progress.processedProducts}개`);
            console.log(`   진행률: ${this.progress.currentCategoryIndex}/${this.progress.totalCategories}\n`);
            
        } catch (error) {
            console.log('새로운 수집 작업 시작\n');
        }
    }

    async saveProgress() {
        this.progress.lastSaveTime = new Date().toISOString();
        this.progress.totalElapsedTime = Date.now() - this.progress.startTime;
        
        await fs.writeFile(this.progressFile, JSON.stringify({
            ...this.progress,
            currentStats: this.stats,
            timestamp: new Date().toISOString()
        }, null, 2));
    }

    async initializeLog() {
        const logHeader = `
=== 상세 이미지 수집 로그 ===
시작 시간: ${new Date().toISOString()}
데이터 소스: ${this.finalDataPath}
이미지 저장: ${this.finalImagePath}

`;
        await fs.appendFile(this.logFile, logHeader);
    }

    async log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        await fs.appendFile(this.logFile, logMessage);
        console.log(message);
    }

    async loadProductData() {
        console.log('📂 제품 데이터 로딩 중...');
        
        const categories = ['가방', '시계', '신발', '악세사리', '지갑'];
        
        for (const category of categories) {
            const filePath = path.join(this.finalDataPath, `${category}_products.json`);
            
            try {
                const fileContent = await fs.readFile(filePath, 'utf8');
                const data = JSON.parse(fileContent);
                
                // 데이터 구조 확인 및 적절한 처리
                if (Array.isArray(data)) {
                    // 악세사리처럼 직접 배열인 경우
                    this.productData[category] = data;
                } else if (data.products && Array.isArray(data.products)) {
                    // 일반적인 { products: [...] } 구조
                    this.productData[category] = data.products;
                } else {
                    // 예상하지 못한 구조
                    console.log(`   ⚠️  ${category}: 예상하지 못한 데이터 구조`);
                    this.productData[category] = [];
                }
                
                this.stats.totalProductsScanned += this.productData[category].length;
                
                console.log(`   ${category}: ${this.productData[category].length}개 제품`);
                
            } catch (error) {
                console.log(`   ❌ ${category} 데이터 로드 실패: ${error.message}`);
                this.productData[category] = [];
            }
        }
        
        this.progress.totalCategories = categories.length;
        this.progress.totalProducts = this.stats.totalProductsScanned;
        
        console.log(`✅ 총 ${this.stats.totalProductsScanned}개 제품 데이터 로드 완료\n`);
    }

    async executeCollection() {
        console.log('====== 상세 이미지 수집 시작 ======\n');
        await this.log('상세 이미지 수집 작업 시작');
        
        const categories = Object.keys(this.productData);
        
        // 진행 중인 카테고리부터 시작
        for (let catIndex = this.progress.currentCategoryIndex; catIndex < categories.length; catIndex++) {
            const category = categories[catIndex];
            
            this.progress.currentCategory = category;
            this.progress.currentCategoryIndex = catIndex;
            
            console.log(`\n[${catIndex + 1}/${categories.length}] 카테고리: ${category}`);
            await this.log(`카테고리 처리 시작: ${category}`);
            
            await this.processCategoryCollection(category);
            
            await this.saveProgress();
            await this.log(`카테고리 완료: ${category}`);
        }
        
        this.progress.completed = true;
        await this.generateFinalReport();
        
        console.log('\n====== 상세 이미지 수집 완료 ======');
        await this.log('상세 이미지 수집 작업 완료');
        
        return this.stats;
    }

    async processCategoryCollection(category) {
        const products = this.productData[category];
        
        console.log(`   총 ${products.length}개 제품 처리 예정`);
        
        // 진행 중인 상품부터 시작
        const startIndex = this.progress.currentCategory === category ? this.progress.currentProductIndex : 0;
        
        for (let productIndex = startIndex; productIndex < products.length; productIndex++) {
            const product = products[productIndex];
            
            this.progress.currentProductIndex = productIndex;
            this.progress.processedProducts++;
            
            try {
                await this.processProductCollection(product);
                
                // 진행 상황 중간 저장 (50개마다)
                if ((productIndex + 1) % 50 === 0) {
                    await this.saveProgress();
                    console.log(`     💾 진행 상황 저장됨 (${productIndex + 1}/${products.length} 제품)`);
                }
                
                // Rate limiting (1-2초 대기)
                await this.delay(1000 + Math.random() * 1000);
                
            } catch (error) {
                console.log(`     ❌ 제품 처리 실패: ${product.productName} - ${error.message}`);
                await this.log(`제품 처리 실패: ${product.productName} - ${error.message}`);
                
                this.results.errors.push({
                    category: product.categoryName,
                    brand: product.brandName,
                    productName: product.productName,
                    detailUrl: product.detailUrl,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // 다음 카테고리를 위해 상품 인덱스 리셋
        this.progress.currentProductIndex = 0;
    }

    async processProductCollection(product) {
        // 1. 제품 폴더 경로 확인
        const productFolderPath = await this.getProductFolderPath(product);
        
        if (!productFolderPath) {
            console.log(`     ⚠️  폴더 없음: ${product.productName}`);
            this.stats.productsSkipped++;
            this.results.skipped.push({
                category: product.categoryName,
                brand: product.brandName,
                productName: product.productName,
                reason: 'folder_not_found',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        // 2. 상세 이미지 개수 사전 체크 (9개 이상이면 수집 완료로 간주)
        const detailImageCount = await this.countExistingDetailImages(productFolderPath);
        
        if (detailImageCount >= 9) {
            console.log(`     ✅ 수집 완료: ${product.productName} (상세 이미지 ${detailImageCount}개 보유)`);
            this.stats.productsWithSufficientImages++;
            this.stats.networkRequestsSaved++; // 네트워크 요청 절약
            this.results.skipped.push({
                category: product.categoryName,
                brand: product.brandName,
                productName: product.productName,
                reason: 'sufficient_detail_images',
                detailImageCount: detailImageCount,
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        // 3. 상세 페이지 방문 및 이미지 수집 (개별 파일별 존재 확인)
        console.log(`     🔍 검사 중: ${product.productName} (현재 ${detailImageCount}개)`);
        this.stats.productsNeedingDetails++;
        
        const collectionResult = await this.collectDetailImagesFromUrl(product, productFolderPath);
        
        if (collectionResult.allSkipped) {
            console.log(`     ✅ 이미 완료: ${product.productName} (모든 상세 이미지 보유)`);
            this.stats.productsAlreadyHaveDetails++;
            this.results.skipped.push({
                category: product.categoryName,
                brand: product.brandName,
                productName: product.productName,
                reason: 'all_detail_images_exist',
                timestamp: new Date().toISOString()
            });
        } else if (collectionResult.success || collectionResult.downloadedCount > 0) {
            const totalAfter = detailImageCount + collectionResult.downloadedCount;
            const statusText = collectionResult.skippedCount > 0 ? 
                `(신규 ${collectionResult.downloadedCount}개, 기존 ${collectionResult.skippedCount}개, 총 ${totalAfter}개)` :
                `(신규 ${collectionResult.downloadedCount}개, 총 ${totalAfter}개)`;
            console.log(`     ✅ 완료: ${product.productName} ${statusText}`);
            this.results.successful.push({
                category: product.categoryName,
                brand: product.brandName,
                productName: product.productName,
                detailUrl: product.detailUrl,
                imagesDownloaded: collectionResult.downloadedCount,
                imagesSkipped: collectionResult.skippedCount,
                initialDetailCount: detailImageCount,
                finalDetailCount: totalAfter,
                downloadSize: collectionResult.totalSize,
                timestamp: new Date().toISOString()
            });
        } else {
            console.log(`     ❌ 실패: ${product.productName} - ${collectionResult.error}`);
            this.results.failed.push({
                category: product.categoryName,
                brand: product.brandName,
                productName: product.productName,
                detailUrl: product.detailUrl,
                error: collectionResult.error,
                timestamp: new Date().toISOString()
            });
        }
    }

    async getProductFolderPath(product) {
        try {
            // savedImageName에서 폴더명 추출
            const savedImageName = product.savedImageName;
            if (!savedImageName) return null;
            
            // 파일 확장자 제거
            let folderName = savedImageName.replace(/\.(jpg|jpeg|png|webp)$/i, '');
            
            // 앞의 "카테고리_" 부분 제거 (예: "가방_" 제거)
            const categoryPrefix = `${product.categoryName}_`;
            if (folderName.startsWith(categoryPrefix)) {
                folderName = folderName.substring(categoryPrefix.length);
            }
            
            // 공백을 언더스코어로 변환
            folderName = folderName.replace(/\s+/g, '_');
            
            const categoryPath = path.join(this.finalImagePath, product.categoryName);
            const brandPath = path.join(categoryPath, product.brandName);
            const productPath = path.join(brandPath, folderName);
            
            // 폴더 존재 확인
            await fs.access(productPath);
            
            return productPath;
            
        } catch (error) {
            return null;
        }
    }

    async countExistingDetailImages(productFolderPath) {
        try {
            const files = await fs.readdir(productFolderPath);
            
            // '상세_'로 시작하는 이미지 파일 개수 계산
            const detailImageCount = files.filter(file => 
                file.startsWith('상세_') && this.isImageFile(file)
            ).length;
            
            return detailImageCount;
            
        } catch (error) {
            return 0;
        }
    }

    async collectDetailImagesFromUrl(product, productFolderPath) {
        const result = {
            success: false,
            downloadedCount: 0,
            skippedCount: 0,
            totalSize: 0,
            allSkipped: false,
            error: null
        };
        
        try {
            // 1. 상세 페이지 HTML 가져오기
            this.stats.detailPagesVisited++;
            
            const response = await this.httpClient.get(product.detailUrl);
            const $ = cheerio.load(response.data);
            
            // 2. 상세 이미지 URL들 추출
            const imageUrls = this.extractDetailImageUrls($);
            
            if (imageUrls.length === 0) {
                result.error = 'no_detail_images_found';
                return result;
            }
            
            this.stats.totalDetailImagesFound += imageUrls.length;
            
            // 3. 각 이미지별로 존재 확인 및 다운로드
            let processedImages = 0;
            
            for (let i = 0; i < imageUrls.length; i++) {
                const imageUrl = imageUrls[i];
                
                try {
                    // 개별 이미지 파일 존재 확인 및 다운로드
                    const downloadResult = await this.downloadDetailImageWithCheck(imageUrl, productFolderPath);
                    
                    if (downloadResult.alreadyExists) {
                        result.skippedCount++;
                        this.stats.totalDetailImagesSkipped++;
                        console.log(`       ⚠️  이미 존재: ${downloadResult.fileName}`);
                    } else if (downloadResult.success) {
                        result.downloadedCount++;
                        result.totalSize += downloadResult.fileSize;
                        this.stats.totalDetailImagesDownloaded++;
                        this.stats.totalDownloadSize += downloadResult.fileSize;
                        console.log(`       ✅ 다운로드: ${downloadResult.fileName} (${(downloadResult.fileSize / 1024).toFixed(1)}KB)`);
                    } else {
                        this.stats.totalDetailImagesFailed++;
                        console.log(`       ❌ 실패: ${imageUrl} - ${downloadResult.error}`);
                    }
                    
                    processedImages++;
                    
                } catch (error) {
                    console.log(`       ❌ 이미지 처리 실패: ${imageUrl} - ${error.message}`);
                    this.stats.totalDetailImagesFailed++;
                }
                
                // 이미지간 딜레이
                await this.delay(500);
            }
            
            // 4. 결과 판정
            result.allSkipped = (result.skippedCount === imageUrls.length);
            result.success = (result.downloadedCount > 0) || result.allSkipped;
            
            if (!result.success && processedImages === 0) {
                result.error = 'all_image_processing_failed';
            }
            
        } catch (error) {
            this.stats.detailPagesFailed++;
            
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                this.stats.networkErrors++;
                result.error = `network_error: ${error.message}`;
            } else if (error.response && error.response.status) {
                result.error = `http_error: ${error.response.status}`;
            } else {
                this.stats.parseErrors++;
                result.error = `parse_error: ${error.message}`;
            }
        }
        
        return result;
    }

    extractDetailImageUrls($) {
        const imageUrls = [];
        
        try {
            // div#sit_inf_explan 내부의 모든 img 태그 찾기
            const allImages = $('#sit_inf_explan img');
            
            if (allImages.length <= 2) {
                // 이미지가 2개 이하면 상세 이미지 없음
                return imageUrls;
            }
            
            // 첫 번째와 마지막 이미지 제외
            const productImages = allImages.slice(1, -1);
            
            productImages.each((index, element) => {
                const src = $(element).attr('src');
                
                if (src && src.includes('trendell.store/data/editor/')) {
                    // 절대 URL로 변환
                    const fullUrl = src.startsWith('http') ? src : `https:${src}`;
                    imageUrls.push(fullUrl);
                }
            });
            
            // 중복 제거
            const uniqueUrls = [...new Set(imageUrls)];
            
            return uniqueUrls;
            
        } catch (error) {
            console.log(`     ❌ 이미지 URL 추출 실패: ${error.message}`);
            return imageUrls;
        }
    }

    async downloadDetailImageWithCheck(imageUrl, productFolderPath) {
        const result = {
            success: false,
            alreadyExists: false,
            fileSize: 0,
            fileName: null,
            error: null
        };
        
        try {
            // 원본 파일명 추출
            const urlPath = new URL(imageUrl).pathname;
            const originalFileName = path.basename(urlPath);
            
            // 저장 파일명 생성
            const savedFileName = `상세_${originalFileName}`;
            const savedFilePath = path.join(productFolderPath, savedFileName);
            
            result.fileName = savedFileName;
            
            // 이미 존재하는지 확인 (개별 파일별로)
            try {
                const stats = await fs.stat(savedFilePath);
                result.alreadyExists = true;
                result.success = true;
                result.fileSize = stats.size;
                return result;
            } catch (error) {
                // 파일이 존재하지 않음 (정상 - 다운로드 진행)
            }
            
            // 이미지 다운로드
            const response = await this.httpClient.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 20000
            });
            
            // 파일 크기 확인 (너무 작은 이미지 필터링)
            if (response.data.length < 5000) { // 5KB 미만
                result.error = `image_too_small: ${response.data.length} bytes`;
                return result;
            }
            
            // 파일 저장
            await fs.writeFile(savedFilePath, response.data);
            
            result.success = true;
            result.fileSize = response.data.length;
            
        } catch (error) {
            if (error.code === 'ENOSPC') {
                this.stats.fileSystemErrors++;
                result.error = 'disk_space_full';
            } else if (error.response && error.response.status === 404) {
                result.error = 'image_not_found';
            } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                result.error = 'network_timeout';
            } else {
                result.error = `download_error: ${error.message}`;
            }
        }
        
        return result;
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
            method: 'detail_image_collection',
            version: '1.0',
            dataSource: this.finalDataPath,
            imageDestination: this.finalImagePath,
            performance: {
                totalElapsedTime: Date.now() - this.progress.startTime,
                totalElapsedMinutes: ((Date.now() - this.progress.startTime) / 1000 / 60).toFixed(1),
                averageTimePerProduct: this.progress.processedProducts > 0 ?
                    (((Date.now() - this.progress.startTime) / 1000) / this.progress.processedProducts).toFixed(2) + 's' : '0s',
                productsPerMinute: this.progress.processedProducts > 0 ?
                    (this.progress.processedProducts / ((Date.now() - this.progress.startTime) / 1000 / 60)).toFixed(1) : '0'
            },
            summary: {
                totalProductsScanned: this.stats.totalProductsScanned,
                productsNeedingDetails: this.stats.productsNeedingDetails,
                productsAlreadyHaveDetails: this.stats.productsAlreadyHaveDetails,
                productsWithSufficientImages: this.stats.productsWithSufficientImages,
                productsSkipped: this.stats.productsSkipped,
                
                detailPagesVisited: this.stats.detailPagesVisited,
                detailPagesFailed: this.stats.detailPagesFailed,
                
                totalDetailImagesFound: this.stats.totalDetailImagesFound,
                totalDetailImagesDownloaded: this.stats.totalDetailImagesDownloaded,
                totalDetailImagesFailed: this.stats.totalDetailImagesFailed,
                totalDetailImagesSkipped: this.stats.totalDetailImagesSkipped,
                
                totalDownloadSize: this.stats.totalDownloadSize,
                totalDownloadSizeMB: (this.stats.totalDownloadSize / 1024 / 1024).toFixed(2),
                
                networkErrors: this.stats.networkErrors,
                parseErrors: this.stats.parseErrors,
                fileSystemErrors: this.stats.fileSystemErrors,
                
                // 효율성 지표
                networkRequestsSaved: this.stats.networkRequestsSaved,
                efficiencyRate: this.stats.totalProductsScanned > 0 ?
                    ((this.stats.networkRequestsSaved / this.stats.totalProductsScanned) * 100).toFixed(1) + '%' : '0%'
            },
            results: {
                successful: this.results.successful.length,
                failed: this.results.failed.length,
                skipped: this.results.skipped.length,
                errors: this.results.errors.length,
                successRate: this.stats.productsNeedingDetails > 0 ?
                    ((this.results.successful.length / this.stats.productsNeedingDetails) * 100).toFixed(1) + '%' : '0%'
            },
            sampleResults: {
                successful: this.results.successful.slice(0, 10),
                failed: this.results.failed.slice(0, 10),
                skipped: this.results.skipped.slice(0, 10),
                errors: this.results.errors.slice(0, 10)
            }
        };
        
        await fs.writeFile(this.reportFile, JSON.stringify(report, null, 2));
        
        // 콘솔 요약 출력
        console.log('\n📊 === 상세 이미지 수집 완료 보고서 ===');
        console.log(`전체 스캔: ${report.summary.totalProductsScanned.toLocaleString()}개 제품`);
        console.log(`수집 필요: ${report.summary.productsNeedingDetails.toLocaleString()}개`);
        console.log(`충분한 이미지 보유: ${report.summary.productsWithSufficientImages.toLocaleString()}개 (9개 이상)`);
        console.log(`이미 완료: ${report.summary.productsAlreadyHaveDetails.toLocaleString()}개`);
        console.log(`스킵: ${report.summary.productsSkipped.toLocaleString()}개`);
        console.log('');
        console.log(`🚀 효율성 지표:`);
        console.log(`   절약된 네트워크 요청: ${report.summary.networkRequestsSaved.toLocaleString()}개`);
        console.log(`   효율성 향상률: ${report.summary.efficiencyRate}`);
        console.log('');
        console.log(`상세 페이지 방문: ${report.summary.detailPagesVisited.toLocaleString()}개`);
        console.log(`페이지 실패: ${report.summary.detailPagesFailed.toLocaleString()}개`);
        console.log('');
        console.log(`발견 이미지: ${report.summary.totalDetailImagesFound.toLocaleString()}개`);
        console.log(`다운로드 성공: ${report.summary.totalDetailImagesDownloaded.toLocaleString()}개`);
        console.log(`이미 보유: ${report.summary.totalDetailImagesSkipped.toLocaleString()}개`);
        console.log(`다운로드 실패: ${report.summary.totalDetailImagesFailed.toLocaleString()}개`);
        console.log('');
        console.log(`총 다운로드: ${report.summary.totalDownloadSizeMB} MB`);
        console.log(`성공률: ${report.results.successRate}`);
        console.log(`소요 시간: ${report.performance.totalElapsedMinutes}분`);
        console.log(`평균 속도: ${report.performance.productsPerMinute}개/분`);
        
        if (report.results.failed > 0) {
            console.log('\n❌ 실패 항목 샘플 (최대 5개):');
            this.results.failed.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. [${item.category}/${item.brand}] ${item.productName}`);
                console.log(`   오류: ${item.error}`);
                console.log(`   URL: ${item.detailUrl}`);
            });
        }
        
        console.log(`\n💾 상세 보고서: ${this.reportFile}`);
        console.log(`📝 상세 로그: ${this.logFile}`);
        
        await this.log(`수집 완료 - 성공: ${report.results.successful}, 실패: ${report.results.failed}, 다운로드: ${report.summary.totalDetailImagesDownloaded}개`);
        
        return report;
    }

    async cleanup() {
        try {
            await fs.unlink(this.progressFile);
            console.log('진행 상황 파일 정리 완료');
        } catch (error) {
            // 파일이 없어도 상관없음
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 메인 실행 함수
async function main() {
    const collector = new DetailImageCollector();
    
    try {
        console.log('====== 상세 이미지 수집 시스템 시작 ======');
        console.log('final_data → final_image_v2 상세 이미지 수집\n');
        
        await collector.init();
        const results = await collector.executeCollection();
        
        console.log('\n====== 상세 이미지 수집 완료 ======');
        console.log('모든 상세 이미지 수집 작업이 완료되었습니다!');
        
        // 성공적 완료 시 진행 상황 파일 정리
        await collector.cleanup();
        
        return results;
        
    } catch (error) {
        console.error('수집 중 오류:', error);
        await collector.log(`수집 오류: ${error.message}`);
        throw error;
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DetailImageCollector;