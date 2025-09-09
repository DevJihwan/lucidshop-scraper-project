const fs = require('fs').promises;
const path = require('path');

class DetailImageMigrator {
    constructor() {
        this.sourceBasePath = './final_images_v1';
        this.targetBasePath = './final_image_v2';
        this.progressFile = './detail_image_migration_progress_v2.json';
        this.logFile = './detail_image_migration_log_v2.txt';
        
        // v2 폴더 매핑 테이블 (v1 기본명 -> v2 실제 폴더명)
        this.folderMappingTable = {};
        
        this.progress = {
            currentCategory: '',
            currentBrand: '',
            currentProduct: '',
            completedCategories: [],
            completedBrands: {},
            completedProducts: {},
            currentCategoryIndex: 0,
            currentBrandIndex: 0,
            currentProductIndex: 0,
            totalCategories: 0,
            totalBrands: 0,
            totalProducts: 0,
            startTime: Date.now(),
            lastSaveTime: null,
            mappingTableBuilt: false
        };
        
        this.stats = {
            totalScanned: 0,
            detailImagesFound: 0,
            successfulCopies: 0,
            failedCopies: 0,
            duplicatesSkipped: 0,
            v1ProductsProcessed: 0,
            v2FoldersMatched: 0,
            v2FoldersNotMatched: 0,
            totalFileSize: 0,
            mappingTableSize: 0
        };
        
        this.results = {
            successful: [],
            failed: [],
            skipped: [],
            unmatchedV1Products: []
        };
        
        console.log('상세이미지 마이그레이션 시스템 v2 초기화...');
    }

    async init() {
        await this.loadProgress();
        await this.initializeLog();
        
        // v2 폴더 매핑 테이블 구축
        if (!this.progress.mappingTableBuilt) {
            await this.buildFolderMappingTable();
            this.progress.mappingTableBuilt = true;
            await this.saveProgress();
        }
        
        console.log('상세이미지 마이그레이션 시스템 v2 초기화 완료');
        console.log(`소스: ${this.sourceBasePath}`);
        console.log(`대상: ${this.targetBasePath}`);
        console.log(`매핑 테이블: ${this.stats.mappingTableSize}개 항목`);
        console.log(`진행률: ${this.progress.currentCategoryIndex}/${this.progress.totalCategories} 카테고리\n`);
        
        return this;
    }

    async buildFolderMappingTable() {
        console.log('📋 v2 폴더 매핑 테이블 구축 중...');
        await this.log('v2 폴더 매핑 테이블 구축 시작');
        
        try {
            await fs.access(this.targetBasePath);
        } catch (error) {
            throw new Error(`v2 대상 디렉토리가 존재하지 않음: ${this.targetBasePath}`);
        }
        
        const categories = await this.getDirectories(this.targetBasePath);
        
        for (const category of categories) {
            const categoryPath = path.join(this.targetBasePath, category);
            const brands = await this.getDirectories(categoryPath);
            
            for (const brand of brands) {
                const brandPath = path.join(categoryPath, brand);
                const products = await this.getDirectories(brandPath);
                
                for (const product of products) {
                    // v2 폴더명에서 기본 이름 추출
                    const baseProductName = this.extractBaseProductName(product);
                    
                    // 매핑 키 생성
                    const mappingKey = `${category}/${brand}/${baseProductName}`;
                    
                    // 매핑 테이블에 저장
                    this.folderMappingTable[mappingKey] = product;
                    this.stats.mappingTableSize++;
                }
            }
        }
        
        console.log(`✅ 매핑 테이블 구축 완료: ${this.stats.mappingTableSize}개 항목`);
        await this.log(`매핑 테이블 구축 완료: ${this.stats.mappingTableSize}개 v2 폴더 매핑됨`);
        
        // 매핑 테이블 샘플 출력
        const sampleMappings = Object.entries(this.folderMappingTable).slice(0, 5);
        console.log('\n📋 매핑 테이블 샘플:');
        sampleMappings.forEach(([key, value]) => {
            console.log(`   ${key} -> ${value}`);
        });
        console.log('');
    }

    /**
     * v2 폴더명에서 기본 제품명을 추출
     * 예: '고야드_19FW_트렁크_스트랩백_그레이_18791(대표)' -> '고야드_19FW_트렁크_스트랩백_그레이'
     */
    extractBaseProductName(v2FolderName) {
        // (대표) 제거
        let baseName = v2FolderName.replace(/\(대표\)$/, '');
        
        // 마지막 언더스코어 뒤의 숫자 ID 제거 (5자리 이상의 숫자)
        baseName = baseName.replace(/_\d{5,}$/, '');
        
        return baseName;
    }

    /**
     * v1 제품 폴더에 매칭되는 v2 폴더를 찾기
     */
    findMatchingV2Folder(category, brand, v1ProductName) {
        const mappingKey = `${category}/${brand}/${v1ProductName}`;
        return this.folderMappingTable[mappingKey] || null;
    }

    async loadProgress() {
        try {
            const progressData = await fs.readFile(this.progressFile, 'utf8');
            const savedProgress = JSON.parse(progressData);
            this.progress = { ...this.progress, ...savedProgress };
            
            console.log('이전 진행 상황 로드됨:');
            console.log(`   현재 카테고리: ${this.progress.currentCategory || '시작 전'}`);
            console.log(`   현재 브랜드: ${this.progress.currentBrand || '시작 전'}`);
            console.log(`   매핑 테이블 구축: ${this.progress.mappingTableBuilt ? '완료' : '필요'}`);
            console.log(`   진행률: ${this.progress.currentCategoryIndex}/${this.progress.totalCategories}\n`);
            
        } catch (error) {
            console.log('새로운 마이그레이션 작업 시작\n');
        }
    }

    async saveProgress() {
        this.progress.lastSaveTime = new Date().toISOString();
        this.progress.totalElapsedTime = Date.now() - this.progress.startTime;
        
        await fs.writeFile(this.progressFile, JSON.stringify(this.progress, null, 2));
    }

    async initializeLog() {
        const logHeader = `
=== 상세이미지 마이그레이션 로그 v2 ===
시작 시간: ${new Date().toISOString()}
소스: ${this.sourceBasePath}
대상: ${this.targetBasePath}

`;
        await fs.appendFile(this.logFile, logHeader);
    }

    async log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        await fs.appendFile(this.logFile, logMessage);
        console.log(message);
    }

    async executeMigration() {
        console.log('====== 상세이미지 마이그레이션 v2 시작 ======\n');
        await this.log('상세이미지 마이그레이션 v2 작업 시작');
        
        try {
            // 소스 디렉토리 존재 확인
            await fs.access(this.sourceBasePath);
        } catch (error) {
            throw new Error(`소스 디렉토리가 존재하지 않음: ${this.sourceBasePath}`);
        }
        
        // 카테고리 스캔
        const categories = await this.getDirectories(this.sourceBasePath);
        this.progress.totalCategories = categories.length;
        
        await this.log(`v1 발견된 카테고리: ${categories.length}개`);
        
        // 마이그레이션 실행
        for (let catIndex = this.progress.currentCategoryIndex; catIndex < categories.length; catIndex++) {
            const category = categories[catIndex];
            
            this.progress.currentCategory = category;
            this.progress.currentCategoryIndex = catIndex;
            
            console.log(`\n[${catIndex + 1}/${categories.length}] 카테고리: ${category}`);
            await this.log(`카테고리 처리 시작: ${category}`);
            
            await this.processCategoryMigration(category);
            
            this.progress.completedCategories.push(category);
            await this.saveProgress();
            
            await this.log(`카테고리 완료: ${category}`);
        }
        
        await this.generateFinalReport();
        
        console.log('\n====== 상세이미지 마이그레이션 v2 완료 ======');
        await this.log('상세이미지 마이그레이션 v2 작업 완료');
        
        return this.stats;
    }

    async processCategoryMigration(category) {
        const categorySourcePath = path.join(this.sourceBasePath, category);
        
        const brands = await this.getDirectories(categorySourcePath);
        this.progress.totalBrands = brands.length;
        
        console.log(`   브랜드: ${brands.length}개`);
        
        for (let brandIndex = 0; brandIndex < brands.length; brandIndex++) {
            const brand = brands[brandIndex];
            
            this.progress.currentBrand = brand;
            this.progress.currentBrandIndex = brandIndex;
            
            console.log(`     [${brandIndex + 1}/${brands.length}] ${brand}`);
            
            await this.processBrandMigration(category, brand);
            
            if (!this.progress.completedBrands[category]) {
                this.progress.completedBrands[category] = [];
            }
            this.progress.completedBrands[category].push(brand);
            
            // 브랜드별 중간 저장 (대용량 처리 대비)
            if ((brandIndex + 1) % 10 === 0) {
                await this.saveProgress();
                console.log(`       💾 진행 상황 저장됨 (${brandIndex + 1}/${brands.length} 브랜드)`);
            }
        }
    }

    async processBrandMigration(category, brand) {
        const brandSourcePath = path.join(this.sourceBasePath, category, brand);
        
        const products = await this.getDirectories(brandSourcePath);
        this.progress.totalProducts = products.length;
        
        for (let productIndex = 0; productIndex < products.length; productIndex++) {
            const v1ProductName = products[productIndex];
            
            this.progress.currentProduct = v1ProductName;
            this.progress.currentProductIndex = productIndex;
            this.stats.v1ProductsProcessed++;
            
            try {
                await this.processProductMigration(category, brand, v1ProductName);
                
                if (!this.progress.completedProducts[category]) {
                    this.progress.completedProducts[category] = {};
                }
                if (!this.progress.completedProducts[category][brand]) {
                    this.progress.completedProducts[category][brand] = [];
                }
                this.progress.completedProducts[category][brand].push(v1ProductName);
                
            } catch (error) {
                console.log(`         ❌ 상품 처리 실패: ${v1ProductName} - ${error.message}`);
                await this.log(`상품 처리 실패: ${category}/${brand}/${v1ProductName} - ${error.message}`);
                
                this.results.failed.push({
                    category,
                    brand,
                    v1ProductName,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    async processProductMigration(category, brand, v1ProductName) {
        // v1 상품 폴더 경로
        const v1ProductPath = path.join(this.sourceBasePath, category, brand, v1ProductName);
        
        // 매칭되는 v2 폴더 찾기
        const v2ProductName = this.findMatchingV2Folder(category, brand, v1ProductName);
        
        if (!v2ProductName) {
            console.log(`         ⚠️  매칭 실패: ${v1ProductName} (v2 폴더 없음)`);
            await this.log(`매칭 실패: ${category}/${brand}/${v1ProductName} - v2 폴더를 찾을 수 없음`);
            
            this.stats.v2FoldersNotMatched++;
            
            this.results.unmatchedV1Products.push({
                category,
                brand,
                v1ProductName,
                reason: 'no_matching_v2_folder',
                timestamp: new Date().toISOString()
            });
            
            return;
        }
        
        // 매칭 성공
        this.stats.v2FoldersMatched++;
        
        // v2 상품 폴더 경로
        const v2ProductPath = path.join(this.targetBasePath, category, brand, v2ProductName);
        
        // v2 폴더 존재 확인
        try {
            await fs.access(v2ProductPath);
        } catch (error) {
            throw new Error(`매칭된 v2 폴더가 실제로 존재하지 않음: ${v2ProductPath}`);
        }
        
        // v1 폴더의 모든 파일 스캔
        const files = await fs.readdir(v1ProductPath);
        
        let productDetailCount = 0;
        let productSuccessCount = 0;
        
        for (const file of files) {
            this.stats.totalScanned++;
            
            // 이미지 파일인지 확인
            if (!this.isImageFile(file)) {
                continue;
            }
            
            // 상세이미지인지 확인 (파일명에 '상세' 포함)
            if (!file.includes('상세')) {
                continue;
            }
            
            this.stats.detailImagesFound++;
            productDetailCount++;
            
            const sourceFilePath = path.join(v1ProductPath, file);
            const targetFilePath = path.join(v2ProductPath, file);
            
            try {
                // 대상 파일이 이미 존재하는지 확인
                try {
                    await fs.access(targetFilePath);
                    console.log(`           ⚠️  이미 존재함: ${file}`);
                    this.stats.duplicatesSkipped++;
                    this.results.skipped.push({
                        category,
                        brand,
                        v1ProductName,
                        v2ProductName,
                        file,
                        reason: 'already_exists',
                        timestamp: new Date().toISOString()
                    });
                    continue;
                } catch (error) {
                    // 파일이 존재하지 않음 (정상)
                }
                
                // 파일 복사
                await fs.copyFile(sourceFilePath, targetFilePath);
                
                // 파일 크기 계산
                const stats = await fs.stat(targetFilePath);
                this.stats.totalFileSize += stats.size;
                
                console.log(`           ✅ 복사 완료: ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
                
                this.stats.successfulCopies++;
                productSuccessCount++;
                
                this.results.successful.push({
                    category,
                    brand,
                    v1ProductName,
                    v2ProductName,
                    file,
                    fileSize: stats.size,
                    timestamp: new Date().toISOString()
                });
                
            } catch (error) {
                console.log(`           ❌ 복사 실패: ${file} - ${error.message}`);
                await this.log(`파일 복사 실패: ${category}/${brand}/${v1ProductName}/${file} - ${error.message}`);
                
                this.stats.failedCopies++;
                
                this.results.failed.push({
                    category,
                    brand,
                    v1ProductName,
                    v2ProductName,
                    file,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        if (productDetailCount > 0) {
            console.log(`         📁 ${v1ProductName} -> ${v2ProductName}: 상세이미지 ${productDetailCount}개 중 ${productSuccessCount}개 복사`);
        } else {
            console.log(`         📁 ${v1ProductName} -> ${v2ProductName}: 상세이미지 없음`);
        }
    }

    async getDirectories(dirPath) {
        const items = await fs.readdir(dirPath);
        const directories = [];
        
        for (const item of items) {
            if (item.startsWith('.')) continue; // 숨김 파일/폴더 제외
            
            const itemPath = path.join(dirPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
                directories.push(item);
            }
        }
        
        return directories.sort();
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
            method: 'detail_image_migration_v2',
            version: '2.0',
            source: this.sourceBasePath,
            target: this.targetBasePath,
            summary: {
                totalScanned: this.stats.totalScanned,
                detailImagesFound: this.stats.detailImagesFound,
                successfulCopies: this.stats.successfulCopies,
                failedCopies: this.stats.failedCopies,
                duplicatesSkipped: this.stats.duplicatesSkipped,
                v1ProductsProcessed: this.stats.v1ProductsProcessed,
                v2FoldersMatched: this.stats.v2FoldersMatched,
                v2FoldersNotMatched: this.stats.v2FoldersNotMatched,
                mappingTableSize: this.stats.mappingTableSize,
                totalFileSize: this.stats.totalFileSize,
                totalFileSizeMB: (this.stats.totalFileSize / 1024 / 1024).toFixed(2)
            },
            performance: {
                totalElapsedTime: Date.now() - this.progress.startTime,
                totalElapsedMinutes: ((Date.now() - this.progress.startTime) / 1000 / 60).toFixed(1),
                averageTimePerImage: this.stats.successfulCopies > 0 ? 
                    (((Date.now() - this.progress.startTime) / 1000) / this.stats.successfulCopies).toFixed(2) + 's' : '0s',
                imagesPerMinute: this.stats.successfulCopies > 0 ?
                    (this.stats.successfulCopies / ((Date.now() - this.progress.startTime) / 1000 / 60)).toFixed(1) : '0'
            },
            results: {
                successful: this.results.successful.length,
                failed: this.results.failed.length,
                skipped: this.results.skipped.length,
                unmatchedV1Products: this.results.unmatchedV1Products.length,
                matchingSuccessRate: this.stats.v1ProductsProcessed > 0 ?
                    ((this.stats.v2FoldersMatched / this.stats.v1ProductsProcessed) * 100).toFixed(1) + '%' : '0%',
                copySuccessRate: this.stats.detailImagesFound > 0 ?
                    ((this.stats.successfulCopies / this.stats.detailImagesFound) * 100).toFixed(1) + '%' : '0%'
            },
            sampleResults: {
                successful: this.results.successful.slice(0, 10),
                failed: this.results.failed.slice(0, 10),
                skipped: this.results.skipped.slice(0, 10),
                unmatchedV1Products: this.results.unmatchedV1Products.slice(0, 10)
            }
        };
        
        await fs.writeFile('./detail_image_migration_report_v2.json', JSON.stringify(report, null, 2));
        
        // 콘솔 요약 출력
        console.log('\n📊 === 상세이미지 마이그레이션 v2 완료 보고서 ===');
        console.log(`v1 상품 처리: ${report.summary.v1ProductsProcessed.toLocaleString()}개`);
        console.log(`v2 폴더 매칭: ${report.summary.v2FoldersMatched.toLocaleString()}개`);
        console.log(`매칭 실패: ${report.summary.v2FoldersNotMatched.toLocaleString()}개`);
        console.log(`매칭 성공률: ${report.results.matchingSuccessRate}`);
        console.log('');
        console.log(`전체 파일 스캔: ${report.summary.totalScanned.toLocaleString()}개`);
        console.log(`상세이미지 발견: ${report.summary.detailImagesFound.toLocaleString()}개`);
        console.log(`성공적 복사: ${report.summary.successfulCopies.toLocaleString()}개`);
        console.log(`복사 실패: ${report.summary.failedCopies.toLocaleString()}개`);
        console.log(`중복 스킵: ${report.summary.duplicatesSkipped.toLocaleString()}개`);
        console.log(`복사 성공률: ${report.results.copySuccessRate}`);
        console.log('');
        console.log(`총 파일 크기: ${report.summary.totalFileSizeMB} MB`);
        console.log(`소요 시간: ${report.performance.totalElapsedMinutes}분`);
        console.log(`평균 속도: ${report.performance.imagesPerMinute}개/분`);
        
        if (report.summary.failedCopies > 0) {
            console.log('\n❌ 복사 실패 항목 샘플 (최대 5개):');
            this.results.failed.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. [${item.category}/${item.brand}] ${item.v1ProductName} -> ${item.v2ProductName || 'N/A'}`);
                console.log(`   파일: ${item.file || 'N/A'}`);
                console.log(`   오류: ${item.error}`);
            });
        }
        
        if (report.summary.v2FoldersNotMatched > 0) {
            console.log('\n⚠️  매칭 실패 항목 샘플 (최대 5개):');
            this.results.unmatchedV1Products.slice(0, 5).forEach((item, index) => {
                console.log(`${index + 1}. [${item.category}/${item.brand}] ${item.v1ProductName}`);
                console.log(`   이유: v2에 매칭되는 폴더 없음`);
            });
        }
        
        console.log(`\n💾 상세 보고서: detail_image_migration_report_v2.json`);
        console.log(`📝 상세 로그: ${this.logFile}`);
        
        await this.log(`마이그레이션 v2 완료 - 매칭: ${report.summary.v2FoldersMatched}/${report.summary.v1ProductsProcessed}, 복사: ${report.summary.successfulCopies}/${report.summary.detailImagesFound}`);
        
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
    const migrator = new DetailImageMigrator();
    
    try {
        console.log('====== 상세이미지 마이그레이션 시스템 v2 시작 ======');
        console.log('final_images_v1 → final_image_v2 상세이미지 복사 (폴더 매칭 기반)\n');
        
        await migrator.init();
        const results = await migrator.executeMigration();
        
        console.log('\n====== 상세이미지 마이그레이션 v2 완료 ======');
        console.log('모든 상세이미지 복사 작업이 완료되었습니다!');
        
        // 성공적 완료 시 진행 상황 파일 정리
        await migrator.cleanup();
        
        return results;
        
    } catch (error) {
        console.error('마이그레이션 중 오류:', error);
        await migrator.log(`마이그레이션 오류: ${error.message}`);
        throw error;
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DetailImageMigrator;