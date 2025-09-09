const fs = require('fs').promises;
const path = require('path');

class ImageStatusAnalyzer {
    constructor() {
        this.targetBasePath = './final_image_v2';
        this.logFile = './image_status_analysis_log.txt';
        this.reportFile = './image_status_analysis_report.json';
        
        this.stats = {
            totalFolders: 0,
            totalImages: 0,
            totalFileSize: 0,
            
            // 폴더 유형별 분류
            representativeOnly: 0,      // (대표) 이미지만 있는 폴더
            supplementOnly: 0,          // (보완) 이미지만 있는 폴더
            detailOnly: 0,              // 상세이미지만 있는 폴더
            representativeWithDetail: 0, // (대표) + 상세이미지
            supplementWithDetail: 0,    // (보완) + 상세이미지
            allTypes: 0,               // (대표) + (보완) + 상세이미지
            representativeWithSupplement: 0, // (대표) + (보완)만
            emptyFolders: 0,           // 이미지가 없는 폴더
            otherTypes: 0,             // 기타 조합
            
            // 이미지 유형별 개수
            representativeImages: 0,
            supplementImages: 0,
            detailImages: 0,
            otherImages: 0
        };
        
        this.categoryStats = {};
        this.brandStats = {};
        
        this.results = {
            representativeOnly: [],
            supplementOnly: [],
            detailOnly: [],
            representativeWithDetail: [],
            supplementWithDetail: [],
            allTypes: [],
            representativeWithSupplement: [],
            emptyFolders: [],
            otherTypes: []
        };
        
        console.log('이미지 상태 분석 시스템 초기화...');
    }

    async init() {
        await this.initializeLog();
        
        try {
            await fs.access(this.targetBasePath);
        } catch (error) {
            throw new Error(`분석 대상 디렉토리가 존재하지 않음: ${this.targetBasePath}`);
        }
        
        console.log('이미지 상태 분석 시스템 초기화 완료');
        console.log(`분석 대상: ${this.targetBasePath}\n`);
        
        return this;
    }

    async initializeLog() {
        const logHeader = `
=== 이미지 상태 분석 로그 ===
시작 시간: ${new Date().toISOString()}
대상: ${this.targetBasePath}

`;
        await fs.writeFile(this.logFile, logHeader);
    }

    async log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        await fs.appendFile(this.logFile, logMessage);
        console.log(message);
    }

    async executeAnalysis() {
        console.log('====== 이미지 상태 분석 시작 ======\n');
        await this.log('이미지 상태 분석 작업 시작');
        
        const startTime = Date.now();
        
        // 카테고리 스캔
        const categories = await this.getDirectories(this.targetBasePath);
        
        await this.log(`발견된 카테고리: ${categories.length}개`);
        
        // 분석 실행
        for (let catIndex = 0; catIndex < categories.length; catIndex++) {
            const category = categories[catIndex];
            
            console.log(`\n[${catIndex + 1}/${categories.length}] 카테고리: ${category}`);
            await this.log(`카테고리 분석 시작: ${category}`);
            
            await this.analyzeCategoryStatus(category);
            
            await this.log(`카테고리 완료: ${category}`);
        }
        
        const totalTime = Date.now() - startTime;
        
        await this.generateFinalReport(totalTime);
        
        console.log('\n====== 이미지 상태 분석 완료 ======');
        await this.log('이미지 상태 분석 작업 완료');
        
        return this.stats;
    }

    async analyzeCategoryStatus(category) {
        const categoryPath = path.join(this.targetBasePath, category);
        
        // 카테고리 통계 초기화
        this.categoryStats[category] = {
            totalFolders: 0,
            representativeOnly: 0,
            supplementOnly: 0,
            detailOnly: 0,
            representativeWithDetail: 0,
            supplementWithDetail: 0,
            allTypes: 0,
            representativeWithSupplement: 0,
            emptyFolders: 0,
            otherTypes: 0
        };
        
        const brands = await this.getDirectories(categoryPath);
        
        console.log(`   브랜드: ${brands.length}개`);
        
        for (let brandIndex = 0; brandIndex < brands.length; brandIndex++) {
            const brand = brands[brandIndex];
            
            console.log(`     [${brandIndex + 1}/${brands.length}] ${brand}`);
            
            await this.analyzeBrandStatus(category, brand);
            
            // 진행 상황 출력 (브랜드 10개마다)
            if ((brandIndex + 1) % 10 === 0) {
                console.log(`       📊 진행 상황: ${brandIndex + 1}/${brands.length} 브랜드 완료`);
            }
        }
    }

    async analyzeBrandStatus(category, brand) {
        const brandPath = path.join(this.targetBasePath, category, brand);
        
        // 브랜드 통계 초기화
        const brandKey = `${category}/${brand}`;
        this.brandStats[brandKey] = {
            totalFolders: 0,
            representativeOnly: 0,
            supplementOnly: 0,
            detailOnly: 0,
            representativeWithDetail: 0,
            supplementWithDetail: 0,
            allTypes: 0,
            representativeWithSupplement: 0,
            emptyFolders: 0,
            otherTypes: 0
        };
        
        const products = await this.getDirectories(brandPath);
        
        for (const product of products) {
            try {
                await this.analyzeProductStatus(category, brand, product);
            } catch (error) {
                console.log(`         ❌ 상품 분석 실패: ${product} - ${error.message}`);
                await this.log(`상품 분석 실패: ${category}/${brand}/${product} - ${error.message}`);
            }
        }
    }

    async analyzeProductStatus(category, brand, product) {
        const productPath = path.join(this.targetBasePath, category, brand, product);
        
        // 상품 폴더의 모든 파일 스캔
        const files = await fs.readdir(productPath);
        
        const imageAnalysis = {
            hasRepresentative: false,
            hasSupplement: false,
            hasDetail: false,
            hasOther: false,
            representativeCount: 0,
            supplementCount: 0,
            detailCount: 0,
            otherCount: 0,
            totalSize: 0,
            imageFiles: []
        };
        
        // 각 파일 분석
        for (const file of files) {
            if (!this.isImageFile(file)) {
                continue;
            }
            
            const filePath = path.join(productPath, file);
            const stats = await fs.stat(filePath);
            
            imageAnalysis.totalSize += stats.size;
            imageAnalysis.imageFiles.push({
                name: file,
                size: stats.size,
                type: this.classifyImageType(file)
            });
            
            // 이미지 유형 분류
            if (file.includes('(대표)')) {
                imageAnalysis.hasRepresentative = true;
                imageAnalysis.representativeCount++;
                this.stats.representativeImages++;
            } else if (file.includes('(보완)')) {
                imageAnalysis.hasSupplement = true;
                imageAnalysis.supplementCount++;
                this.stats.supplementImages++;
            } else if (file.includes('상세')) {
                imageAnalysis.hasDetail = true;
                imageAnalysis.detailCount++;
                this.stats.detailImages++;
            } else {
                imageAnalysis.hasOther = true;
                imageAnalysis.otherCount++;
                this.stats.otherImages++;
            }
        }
        
        // 폴더 유형 분류
        const folderType = this.classifyFolderType(imageAnalysis);
        
        // 통계 업데이트
        this.updateStats(folderType, imageAnalysis);
        this.updateCategoryStats(category, folderType);
        this.updateBrandStats(category, brand, folderType);
        
        // 결과 저장
        const folderInfo = {
            category,
            brand,
            product,
            folderType,
            imageAnalysis: {
                totalImages: imageAnalysis.imageFiles.length,
                representativeCount: imageAnalysis.representativeCount,
                supplementCount: imageAnalysis.supplementCount,
                detailCount: imageAnalysis.detailCount,
                otherCount: imageAnalysis.otherCount,
                totalSize: imageAnalysis.totalSize,
                totalSizeMB: (imageAnalysis.totalSize / 1024 / 1024).toFixed(2)
            },
            timestamp: new Date().toISOString()
        };
        
        this.results[folderType].push(folderInfo);
    }

    classifyImageType(filename) {
        if (filename.includes('(대표)')) return 'representative';
        if (filename.includes('(보완)')) return 'supplement';
        if (filename.includes('상세')) return 'detail';
        return 'other';
    }

    classifyFolderType(analysis) {
        const { hasRepresentative, hasSupplement, hasDetail, imageFiles } = analysis;
        
        if (imageFiles.length === 0) {
            return 'emptyFolders';
        }
        
        if (hasRepresentative && hasSupplement && hasDetail) {
            return 'allTypes';
        } else if (hasRepresentative && hasDetail && !hasSupplement) {
            return 'representativeWithDetail';
        } else if (hasSupplement && hasDetail && !hasRepresentative) {
            return 'supplementWithDetail';
        } else if (hasRepresentative && hasSupplement && !hasDetail) {
            return 'representativeWithSupplement';
        } else if (hasRepresentative && !hasSupplement && !hasDetail) {
            return 'representativeOnly';
        } else if (hasSupplement && !hasRepresentative && !hasDetail) {
            return 'supplementOnly';
        } else if (hasDetail && !hasRepresentative && !hasSupplement) {
            return 'detailOnly';
        } else {
            return 'otherTypes';
        }
    }

    updateStats(folderType, analysis) {
        this.stats.totalFolders++;
        this.stats.totalImages += analysis.imageFiles.length;
        this.stats.totalFileSize += analysis.totalSize;
        this.stats[folderType]++;
    }

    updateCategoryStats(category, folderType) {
        this.categoryStats[category].totalFolders++;
        this.categoryStats[category][folderType]++;
    }

    updateBrandStats(category, brand, folderType) {
        const brandKey = `${category}/${brand}`;
        this.brandStats[brandKey].totalFolders++;
        this.brandStats[brandKey][folderType]++;
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

    async generateFinalReport(totalTime) {
        const report = {
            completionDateTime: new Date().toISOString(),
            method: 'image_status_analysis',
            version: '1.0',
            targetPath: this.targetBasePath,
            analysisTime: {
                totalElapsedTime: totalTime,
                totalElapsedMinutes: (totalTime / 1000 / 60).toFixed(1),
                averageTimePerFolder: this.stats.totalFolders > 0 ?
                    (totalTime / this.stats.totalFolders).toFixed(2) + 'ms' : '0ms'
            },
            overallSummary: {
                totalFolders: this.stats.totalFolders,
                totalImages: this.stats.totalImages,
                totalFileSize: this.stats.totalFileSize,
                totalFileSizeMB: (this.stats.totalFileSize / 1024 / 1024).toFixed(2),
                totalFileSizeGB: (this.stats.totalFileSize / 1024 / 1024 / 1024).toFixed(2)
            },
            folderTypeDistribution: {
                representativeOnly: {
                    count: this.stats.representativeOnly,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.representativeOnly / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                },
                supplementOnly: {
                    count: this.stats.supplementOnly,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.supplementOnly / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                },
                detailOnly: {
                    count: this.stats.detailOnly,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.detailOnly / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                },
                representativeWithDetail: {
                    count: this.stats.representativeWithDetail,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.representativeWithDetail / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                },
                supplementWithDetail: {
                    count: this.stats.supplementWithDetail,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.supplementWithDetail / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                },
                allTypes: {
                    count: this.stats.allTypes,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.allTypes / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                },
                representativeWithSupplement: {
                    count: this.stats.representativeWithSupplement,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.representativeWithSupplement / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                },
                emptyFolders: {
                    count: this.stats.emptyFolders,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.emptyFolders / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                },
                otherTypes: {
                    count: this.stats.otherTypes,
                    percentage: this.stats.totalFolders > 0 ? 
                        ((this.stats.otherTypes / this.stats.totalFolders) * 100).toFixed(1) + '%' : '0%'
                }
            },
            imageTypeDistribution: {
                representativeImages: this.stats.representativeImages,
                supplementImages: this.stats.supplementImages,
                detailImages: this.stats.detailImages,
                otherImages: this.stats.otherImages,
                total: this.stats.totalImages
            },
            categoryStats: this.categoryStats,
            sampleResults: {
                representativeOnly: this.results.representativeOnly.slice(0, 5),
                supplementOnly: this.results.supplementOnly.slice(0, 5),
                detailOnly: this.results.detailOnly.slice(0, 5),
                representativeWithDetail: this.results.representativeWithDetail.slice(0, 5),
                supplementWithDetail: this.results.supplementWithDetail.slice(0, 5),
                allTypes: this.results.allTypes.slice(0, 5),
                representativeWithSupplement: this.results.representativeWithSupplement.slice(0, 5),
                emptyFolders: this.results.emptyFolders.slice(0, 5),
                otherTypes: this.results.otherTypes.slice(0, 5)
            }
        };
        
        await fs.writeFile(this.reportFile, JSON.stringify(report, null, 2));
        
        // 콘솔 요약 출력
        console.log('\n📊 === 이미지 상태 분석 완료 보고서 ===');
        console.log(`총 분석 폴더: ${report.overallSummary.totalFolders.toLocaleString()}개`);
        console.log(`총 이미지: ${report.overallSummary.totalImages.toLocaleString()}개`);
        console.log(`총 파일 크기: ${report.overallSummary.totalFileSizeGB} GB`);
        console.log(`분석 시간: ${report.analysisTime.totalElapsedMinutes}분`);
        console.log('');
        
        console.log('📁 === 폴더 유형별 분포 ===');
        console.log(`🎯 (대표)만: ${report.folderTypeDistribution.representativeOnly.count.toLocaleString()}개 (${report.folderTypeDistribution.representativeOnly.percentage})`);
        console.log(`🔄 (보완)만: ${report.folderTypeDistribution.supplementOnly.count.toLocaleString()}개 (${report.folderTypeDistribution.supplementOnly.percentage})`);
        console.log(`📋 상세만: ${report.folderTypeDistribution.detailOnly.count.toLocaleString()}개 (${report.folderTypeDistribution.detailOnly.percentage})`);
        console.log(`🎯📋 (대표)+상세: ${report.folderTypeDistribution.representativeWithDetail.count.toLocaleString()}개 (${report.folderTypeDistribution.representativeWithDetail.percentage})`);
        console.log(`🔄📋 (보완)+상세: ${report.folderTypeDistribution.supplementWithDetail.count.toLocaleString()}개 (${report.folderTypeDistribution.supplementWithDetail.percentage})`);
        console.log(`🎯🔄 (대표)+(보완): ${report.folderTypeDistribution.representativeWithSupplement.count.toLocaleString()}개 (${report.folderTypeDistribution.representativeWithSupplement.percentage})`);
        console.log(`🎯🔄📋 모든 유형: ${report.folderTypeDistribution.allTypes.count.toLocaleString()}개 (${report.folderTypeDistribution.allTypes.percentage})`);
        console.log(`📁 빈 폴더: ${report.folderTypeDistribution.emptyFolders.count.toLocaleString()}개 (${report.folderTypeDistribution.emptyFolders.percentage})`);
        console.log(`❓ 기타: ${report.folderTypeDistribution.otherTypes.count.toLocaleString()}개 (${report.folderTypeDistribution.otherTypes.percentage})`);
        console.log('');
        
        console.log('🖼️  === 이미지 유형별 분포 ===');
        console.log(`(대표) 이미지: ${report.imageTypeDistribution.representativeImages.toLocaleString()}개`);
        console.log(`(보완) 이미지: ${report.imageTypeDistribution.supplementImages.toLocaleString()}개`);
        console.log(`상세 이미지: ${report.imageTypeDistribution.detailImages.toLocaleString()}개`);
        console.log(`기타 이미지: ${report.imageTypeDistribution.otherImages.toLocaleString()}개`);
        
        console.log('');
        console.log('📊 === 카테고리별 현황 ===');
        Object.entries(this.categoryStats).forEach(([category, stats]) => {
            console.log(`${category}: ${stats.totalFolders}개 폴더`);
            console.log(`  🎯 (대표)만: ${stats.representativeOnly}개`);
            console.log(`  🎯📋 (대표)+상세: ${stats.representativeWithDetail}개`);
            console.log(`  🎯🔄📋 완전: ${stats.allTypes}개`);
        });
        
        console.log(`\n💾 상세 보고서: ${this.reportFile}`);
        console.log(`📝 상세 로그: ${this.logFile}`);
        
        await this.log(`분석 완료 - 총 ${report.overallSummary.totalFolders}개 폴더, ${report.overallSummary.totalImages}개 이미지`);
        
        return report;
    }
}

// 메인 실행 함수
async function main() {
    const analyzer = new ImageStatusAnalyzer();
    
    try {
        console.log('====== 이미지 상태 분석 시스템 시작 ======');
        console.log('final_image_v2 폴더 상태 분석\n');
        
        await analyzer.init();
        const results = await analyzer.executeAnalysis();
        
        console.log('\n====== 이미지 상태 분석 완료 ======');
        console.log('모든 폴더 상태 분석이 완료되었습니다!');
        
        return results;
        
    } catch (error) {
        console.error('분석 중 오류:', error);
        await analyzer.log(`분석 오류: ${error.message}`);
        throw error;
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = ImageStatusAnalyzer;