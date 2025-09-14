const fs = require('fs').promises;
const path = require('path');

class ImageVerificationSystem {
    constructor() {
        this.finalImagePath = './final_image_v2';
        this.finalDataPath = './final_data';
        this.reportFile = './image_verification_report.json';
        this.logFile = './image_verification_log.txt';
        this.detailReportFile = './image_verification_detail.json';
        
        this.stats = {
            totalFolders: 0,
            totalProducts: 0,
            totalFiles: 0,
            
            totalRepresentativeImages: 0,
            totalDetailImages: 0,
            totalOtherImages: 0,
            
            productsWithRepresentative: 0,
            productsWithoutRepresentative: 0,
            productsWithDetails: 0,
            productsWithoutDetails: 0,
            
            categoryStats: {}
        };
        
        this.verificationResults = [];
        this.problemProducts = [];
        this.productDataMap = new Map(); // 상품 데이터를 저장할 맵
        
        console.log('이미지 파일 검증 시스템 초기화...');
    }

    async init() {
        await this.initializeLog();
        await this.loadProductData();
        
        console.log('이미지 파일 검증 시스템 초기화 완료');
        console.log(`이미지 경로: ${this.finalImagePath}`);
        console.log(`상품 데이터 경로: ${this.finalDataPath}`);
        console.log(`검증 패턴:`);
        console.log(`  - 대표이미지: (대표), (보안)`);
        console.log(`  - 상세이미지: 상세{숫자}, 상세_{숫자} (1개 이상 필요)\n`);
        
        return this;
    }

    async loadProductData() {
        console.log('상품 데이터 로딩 중...');
        
        const dataFiles = [
            '가방_products.json',
            '지갑_products.json', 
            '시계_products.json',
            '악세사리_products.json',
            '신발_products.json'
        ];
        
        for (const dataFile of dataFiles) {
            try {
                const filePath = path.join(this.finalDataPath, dataFile);
                const fileContent = await fs.readFile(filePath, 'utf8');
                const products = JSON.parse(fileContent);
                
                const categoryName = dataFile.replace('_products.json', '');
                
                console.log(`  - ${categoryName}: ${products.length}개 상품 로드`);
                
                products.forEach(product => {
                    const key = `${categoryName}/${product.brand}/${product.productName}`;
                    this.productDataMap.set(key, {
                        ...product,
                        category: categoryName
                    });
                });
                
            } catch (error) {
                console.error(`데이터 파일 로딩 실패 (${dataFile}): ${error.message}`);
                await this.log(`데이터 파일 로딩 실패 (${dataFile}): ${error.message}`);
            }
        }
        
        console.log(`총 ${this.productDataMap.size}개 상품 데이터 로드 완료\n`);
        await this.log(`총 ${this.productDataMap.size}개 상품 데이터 로드 완료`);
    }

    async initializeLog() {
        const logHeader = `
=== 이미지 파일 검증 로그 ===
시작 시간: ${new Date().toISOString()}
이미지 경로: ${this.finalImagePath}
상품 데이터 경로: ${this.finalDataPath}
검증 기준:
  - 대표이미지: (대표), (보안) 포함 파일명
  - 상세이미지: 상세{숫자}, 상세_{숫자} 포함 파일명 (1개 이상 필요)

`;
        await fs.appendFile(this.logFile, logHeader);
    }

    async log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        await fs.appendFile(this.logFile, logMessage);
        console.log(message);
    }

    async executeVerification() {
        console.log('====== 이미지 파일 검증 시작 ======\n');
        await this.log('이미지 파일 검증 작업 시작');
        
        try {
            // final_image_v2 폴더 존재 확인
            await fs.access(this.finalImagePath);
            
            // 카테고리별로 검증
            const categories = await fs.readdir(this.finalImagePath);
            
            for (const category of categories) {
                const categoryPath = path.join(this.finalImagePath, category);
                const categoryStats = await fs.stat(categoryPath);
                
                if (categoryStats.isDirectory()) {
                    console.log(`\n📁 카테고리 검증: ${category}`);
                    await this.log(`카테고리 검증 시작: ${category}`);
                    
                    this.stats.categoryStats[category] = {
                        totalProducts: 0,
                        totalFiles: 0,
                        representativeImages: 0,
                        detailImages: 0,
                        otherImages: 0,
                        productsWithRepresentative: 0,
                        productsWithoutRepresentative: 0,
                        productsWithDetails: 0,
                        productsWithoutDetails: 0
                    };
                    
                    await this.verifyCategoryFolder(categoryPath, category);
                    
                    console.log(`   카테고리 완료: ${category}`);
                    console.log(`     - 상품: ${this.stats.categoryStats[category].totalProducts}개`);
                    console.log(`     - 파일: ${this.stats.categoryStats[category].totalFiles}개`);
                    console.log(`     - 대표이미지: ${this.stats.categoryStats[category].representativeImages}개`);
                    console.log(`     - 상세이미지: ${this.stats.categoryStats[category].detailImages}개`);
                }
            }
            
        } catch (error) {
            console.error(`경로 접근 오류: ${error.message}`);
            await this.log(`경로 접근 오류: ${error.message}`);
            throw error;
        }
        
        const report = await this.generateReport();
        
        console.log('\n====== 이미지 파일 검증 완료 ======');
        await this.log('이미지 파일 검증 작업 완료');
        
        return report;
    }

    async verifyCategoryFolder(categoryPath, categoryName) {
        try {
            const brands = await fs.readdir(categoryPath);
            
            for (const brand of brands) {
                const brandPath = path.join(categoryPath, brand);
                const brandStats = await fs.stat(brandPath);
                
                if (brandStats.isDirectory()) {
                    await this.verifyBrandFolder(brandPath, categoryName, brand);
                }
            }
            
        } catch (error) {
            console.log(`   카테고리 폴더 검증 오류: ${error.message}`);
            await this.log(`카테고리 폴더 검증 오류 (${categoryName}): ${error.message}`);
        }
    }

    async verifyBrandFolder(brandPath, categoryName, brandName) {
        try {
            const products = await fs.readdir(brandPath);
            
            for (const product of products) {
                const productPath = path.join(brandPath, product);
                const productStats = await fs.stat(productPath);
                
                if (productStats.isDirectory()) {
                    // 상품 데이터에서 해당 상품이 존재하는지 확인
                    const productKey = `${categoryName}/${brandName}/${product}`;
                    if (this.productDataMap.has(productKey)) {
                        this.stats.totalProducts++;
                        this.stats.categoryStats[categoryName].totalProducts++;
                        
                        await this.verifyProductFolder(productPath, categoryName, brandName, product);
                    } else {
                        // 상품 데이터에 없는 폴더는 건너뛰고 로그에만 기록
                        await this.log(`상품 데이터에 없는 폴더: ${productKey}`);
                    }
                }
            }
            
        } catch (error) {
            console.log(`   브랜드 폴더 검증 오류: ${error.message}`);
            await this.log(`브랜드 폴더 검증 오류 (${categoryName}/${brandName}): ${error.message}`);
        }
    }

    async verifyProductFolder(productPath, categoryName, brandName, productName) {
        try {
            const files = await fs.readdir(productPath);
            const productKey = `${categoryName}/${brandName}/${productName}`;
            const productData = this.productDataMap.get(productKey);
            
            const productResult = {
                category: categoryName,
                brand: brandName,
                product: productName,
                path: productPath,
                productData: productData,
                totalFiles: files.length,
                representativeImages: 0,
                detailImages: 0,
                otherImages: 0,
                representativeFiles: [],
                detailFiles: [],
                otherFiles: [],
                hasRepresentative: false,
                hasDetails: false
            };
            
            // 각 파일 분석
            for (const file of files) {
                const filePath = path.join(productPath, file);
                const fileStats = await fs.stat(filePath);
                
                if (fileStats.isFile() && this.isImageFile(file)) {
                    this.stats.totalFiles++;
                    this.stats.categoryStats[categoryName].totalFiles++;
                    
                    // 파일 유형 분석
                    if (this.isRepresentativeImage(file)) {
                        productResult.representativeImages++;
                        productResult.representativeFiles.push(file);
                        this.stats.totalRepresentativeImages++;
                        this.stats.categoryStats[categoryName].representativeImages++;
                    } else if (this.isDetailImage(file)) {
                        productResult.detailImages++;
                        productResult.detailFiles.push(file);
                        this.stats.totalDetailImages++;
                        this.stats.categoryStats[categoryName].detailImages++;
                    } else {
                        productResult.otherImages++;
                        productResult.otherFiles.push(file);
                        this.stats.totalOtherImages++;
                        this.stats.categoryStats[categoryName].otherImages++;
                    }
                }
            }
            
            // 상품별 상태 분석 (1개 이상 기준으로 변경)
            productResult.hasRepresentative = productResult.representativeImages > 0;
            productResult.hasDetails = productResult.detailImages >= 1; // 1개 이상으로 변경
            
            // 통계 업데이트
            if (productResult.hasRepresentative) {
                this.stats.productsWithRepresentative++;
                this.stats.categoryStats[categoryName].productsWithRepresentative++;
            } else {
                this.stats.productsWithoutRepresentative++;
                this.stats.categoryStats[categoryName].productsWithoutRepresentative++;
            }
            
            if (productResult.hasDetails) {
                this.stats.productsWithDetails++;
                this.stats.categoryStats[categoryName].productsWithDetails++;
            } else {
                this.stats.productsWithoutDetails++;
                this.stats.categoryStats[categoryName].productsWithoutDetails++;
            }
            
            // 문제 상품 식별
            if (!productResult.hasRepresentative || !productResult.hasDetails) {
                this.problemProducts.push({
                    ...productResult,
                    issues: [
                        !productResult.hasRepresentative ? 'no_representative_image' : null,
                        !productResult.hasDetails ? 'no_detail_images' : null
                    ].filter(issue => issue !== null)
                });
            }
            
            this.verificationResults.push(productResult);
            
            // 진행 상황 표시 (1000개마다)
            if (this.stats.totalProducts % 1000 === 0) {
                console.log(`     검증 진행: ${this.stats.totalProducts.toLocaleString()}개 상품 완료`);
            }
            
        } catch (error) {
            console.log(`   상품 폴더 검증 오류: ${error.message}`);
            await this.log(`상품 폴더 검증 오류 (${categoryName}/${brandName}/${productName}): ${error.message}`);
        }
    }

    isImageFile(filename) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
        return imageExtensions.some(ext => 
            filename.toLowerCase().endsWith(ext)
        );
    }

    isRepresentativeImage(filename) {
        // (대표) 또는 (보안)이 포함된 파일명
        return filename.includes('(대표)') || filename.includes('(보안)');
    }

    isDetailImage(filename) {
        // 상세{숫자} 또는 상세_{숫자} 패턴
        const detailPattern = /상세_?\d+/;
        return detailPattern.test(filename);
    }

    async generateReport() {
        const report = {
            completionDateTime: new Date().toISOString(),
            operation: 'image_verification',
            imagePath: this.finalImagePath,
            dataPath: this.finalDataPath,
            verification: {
                representativeImagePattern: '(대표), (보안)',
                detailImagePattern: '상세{숫자}, 상세_{숫자} (1개 이상 필요)'
            },
            summary: {
                totalProductsInData: this.productDataMap.size,
                totalProductsVerified: this.stats.totalProducts,
                totalFiles: this.stats.totalFiles,
                totalRepresentativeImages: this.stats.totalRepresentativeImages,
                totalDetailImages: this.stats.totalDetailImages,
                totalOtherImages: this.stats.totalOtherImages,
                
                productsWithRepresentative: this.stats.productsWithRepresentative,
                productsWithoutRepresentative: this.stats.productsWithoutRepresentative,
                representativeRate: this.stats.totalProducts > 0 ? 
                    ((this.stats.productsWithRepresentative / this.stats.totalProducts) * 100).toFixed(1) + '%' : '0%',
                
                productsWithDetails: this.stats.productsWithDetails,
                productsWithoutDetails: this.stats.productsWithoutDetails,
                detailRate: this.stats.totalProducts > 0 ? 
                    ((this.stats.productsWithDetails / this.stats.totalProducts) * 100).toFixed(1) + '%' : '0%'
            },
            categoryBreakdown: this.stats.categoryStats,
            problemProducts: this.problemProducts.length,
            topIssues: this.getTopIssues(),
            averageImages: {
                representativePerProduct: this.stats.totalProducts > 0 ? 
                    (this.stats.totalRepresentativeImages / this.stats.totalProducts).toFixed(1) : '0',
                detailPerProduct: this.stats.totalProducts > 0 ? 
                    (this.stats.totalDetailImages / this.stats.totalProducts).toFixed(1) : '0'
            }
        };
        
        // 메인 보고서 저장
        await fs.writeFile(this.reportFile, JSON.stringify(report, null, 2));
        
        // 상세 보고서 저장 (각 상품별 결과)
        const detailReport = {
            completionDateTime: new Date().toISOString(),
            totalProducts: this.verificationResults.length,
            verificationResults: this.verificationResults,
            problemProducts: this.problemProducts
        };
        await fs.writeFile(this.detailReportFile, JSON.stringify(detailReport, null, 2));
        
        // 콘솔 요약 출력
        console.log('\n📊 === 이미지 파일 검증 완료 보고서 ===');
        console.log(`상품 데이터 총 개수: ${report.summary.totalProductsInData.toLocaleString()}개`);
        console.log(`검증된 상품: ${report.summary.totalProductsVerified.toLocaleString()}개`);
        console.log(`총 파일: ${report.summary.totalFiles.toLocaleString()}개`);
        console.log('');
        console.log(`대표이미지:`);
        console.log(`  - 총 개수: ${report.summary.totalRepresentativeImages.toLocaleString()}개`);
        console.log(`  - 보유 상품: ${report.summary.productsWithRepresentative.toLocaleString()}개 (${report.summary.representativeRate})`);
        console.log(`  - 미보유 상품: ${report.summary.productsWithoutRepresentative.toLocaleString()}개`);
        console.log('');
        console.log(`상세이미지:`);
        console.log(`  - 총 개수: ${report.summary.totalDetailImages.toLocaleString()}개`);
        console.log(`  - 보유 상품 (1개 이상): ${report.summary.productsWithDetails.toLocaleString()}개 (${report.summary.detailRate})`);
        console.log(`  - 미보유 상품 (0개): ${report.summary.productsWithoutDetails.toLocaleString()}개`);
        console.log('');
        console.log(`평균 이미지 수:`);
        console.log(`  - 상품당 대표이미지: ${report.averageImages.representativePerProduct}개`);
        console.log(`  - 상품당 상세이미지: ${report.averageImages.detailPerProduct}개`);
        
        console.log('\n📁 카테고리별 요약:');
        Object.entries(this.stats.categoryStats).forEach(([category, stats]) => {
            console.log(`  ${category}:`);
            console.log(`    - 상품: ${stats.totalProducts.toLocaleString()}개`);
            console.log(`    - 대표이미지: ${stats.representativeImages.toLocaleString()}개`);
            console.log(`    - 상세이미지: ${stats.detailImages.toLocaleString()}개`);
            console.log(`    - 상세이미지 보유: ${stats.productsWithDetails.toLocaleString()}개`);
            console.log(`    - 상세이미지 미보유: ${stats.productsWithoutDetails.toLocaleString()}개`);
        });
        
        if (this.problemProducts.length > 0) {
            console.log('\n⚠️  문제 상품 (상위 10개):');
            this.problemProducts.slice(0, 10).forEach((product, index) => {
                console.log(`${index + 1}. [${product.category}/${product.brand}] ${product.product}`);
                console.log(`   대표이미지: ${product.representativeImages}개, 상세이미지: ${product.detailImages}개`);
                console.log(`   문제: ${product.issues.join(', ')}`);
            });
            
            if (this.problemProducts.length > 10) {
                console.log(`   ... 외 ${this.problemProducts.length - 10}개 상품`);
            }
        }
        
        console.log(`\n💾 메인 보고서: ${this.reportFile}`);
        console.log(`📋 상세 보고서: ${this.detailReportFile}`);
        console.log(`📝 로그 파일: ${this.logFile}`);
        
        await this.log(`검증 완료 - 총 ${report.summary.totalProductsVerified}개 상품 검증, 문제 상품: ${this.problemProducts.length}개`);
        
        return report;
    }

    getTopIssues() {
        const issueCount = {};
        
        this.problemProducts.forEach(product => {
            product.issues.forEach(issue => {
                issueCount[issue] = (issueCount[issue] || 0) + 1;
            });
        });
        
        return Object.entries(issueCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([issue, count]) => ({
                issue,
                count,
                description: this.getIssueDescription(issue)
            }));
    }

    getIssueDescription(issue) {
        const descriptions = {
            'no_representative_image': '대표이미지 없음',
            'no_detail_images': '상세이미지 없음'
        };
        return descriptions[issue] || issue;
    }
}

// 메인 실행 함수
async function main() {
    const verificationSystem = new ImageVerificationSystem();
    
    try {
        console.log('====== 이미지 파일 검증 시스템 시작 ======');
        console.log('상품 데이터 기준으로 대표이미지와 상세이미지 검증\n');
        
        await verificationSystem.init();
        const results = await verificationSystem.executeVerification();
        
        console.log('\n====== 이미지 파일 검증 완료 ======');
        console.log('모든 상품의 이미지 검증이 완료되었습니다!');
        
        return results;
        
    } catch (error) {
        console.error('검증 중 오류:', error);
        throw error;
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ImageVerificationSystem;