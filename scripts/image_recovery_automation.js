const fs = require('fs');
const path = require('path');

// 이전 분석 스크립트의 함수들을 재사용
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
}

function isRepresentativeImage(filename) {
    return filename.includes('(대표)') && isImageFile(filename);
}

function extractProductNumber(text) {
    // 복합 번호(예: 786016_02_7711)를 단일 번호로 처리하도록 패턴 개선
    const patterns = [
        /(\d{5,}(?:_\d{2,}_\d{4,})?)/g // 5자리 이상 숫자 또는 숫자_숫자_숫자 패턴
    ];
    
    const numbers = [];
    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            numbers.push(match[0]);
        }
    }
    
    return numbers;
}

function parseImageFileName(filename) {
    try {
        const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|gif|bmp|webp)$/i, '');
        const normalizedName = nameWithoutExt.replace(/\s+/g, '_');
        const parts = normalizedName.split('_');
        
        if (parts.length >= 3) {
            const category = parts[0].toLowerCase().trim();
            const brand = parts[1].toLowerCase().trim();
            
            let remainingParts = parts.slice(2);
            remainingParts = remainingParts.filter(part => 
                !part.includes('(대표)') && 
                !part.includes('(보완)') && 
                !part.includes('(타겟브랜드)') &&
                part !== 'recovered'
            );
            
            const productText = remainingParts.join('_');
            const productNumbers = extractProductNumber(productText);
            
            let productName = productText;
            for (const num of productNumbers) {
                productName = productName.replace(new RegExp(num, 'g'), '').replace(/_+/g, '_');
            }
            productName = productName.replace(/^_|_$/g, '').toLowerCase().trim();
            
            return {
                category: category,
                brand: brand,
                productName: productName,
                productNumbers: productNumbers,
                filename: filename,
                isRepresentative: filename.includes('(대표)') || filename.includes('(보완)'),
                originalText: productText
            };
        }
    } catch (error) {
        console.error('파일명 파싱 오류:', filename, error.message);
    }
    
    return {
        category: 'unknown',
        brand: 'unknown',
        productName: filename,
        productNumbers: [],
        filename: filename,
        isRepresentative: filename.includes('(대표)') || filename.includes('(보완)'),
        originalText: filename
    };
}

function parseFromFolderStructure(category, brand, productFolderName) {
    const productNumbers = extractProductNumber(productFolderName);
    
    let productName = productFolderName;
    for (const num of productNumbers) {
        productName = productName.replace(new RegExp(num, 'g'), '').replace(/_+/g, '_');
    }
    productName = productName.replace(/^_|_$/g, '').toLowerCase().trim();
    
    return {
        category: category.toLowerCase().trim(),
        brand: brand.toLowerCase().trim(),
        productName: productName,
        productNumbers: productNumbers,
        isRepresentative: true,
        source: 'folder_structure',
        originalText: productFolderName
    };
}

function countRepresentativeImages(folderPath) {
    try {
        const files = fs.readdirSync(folderPath);
        return files.filter(file => {
            const filePath = path.join(folderPath, file);
            return fs.statSync(filePath).isFile() && isRepresentativeImage(file);
        }).length;
    } catch (error) {
        return -1;
    }
}

function collectImagesFromFlatFolder(folderPath, folderName) {
    const images = [];
    
    if (!fs.existsSync(folderPath)) {
        return images;
    }
    
    try {
        const files = fs.readdirSync(folderPath);
        
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isFile() && isImageFile(file)) {
                const imageInfo = parseImageFileName(file);
                imageInfo.source = folderName;
                imageInfo.fullPath = filePath;
                images.push(imageInfo);
            }
        }
    } catch (error) {
        console.error(`${folderName} 폴더 읽기 오류:`, error.message);
    }
    
    return images;
}

function processStructuredFolder(folderPath) {
    const results = {
        totalProductFolders: 0,
        normalCount: 0,
        noImagesCount: 0,
        multipleImagesCount: 0,
        errorCount: 0,
        imageList: [],
        missingProducts: [],
        successRate: '0'
    };
    
    try {
        const categories = fs.readdirSync(folderPath).filter(item => {
            const itemPath = path.join(folderPath, item);
            return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
        });
        
        for (const category of categories) {
            const categoryPath = path.join(folderPath, category);
            
            try {
                const brands = fs.readdirSync(categoryPath).filter(item => {
                    const itemPath = path.join(categoryPath, item);
                    return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
                });
                
                for (const brand of brands) {
                    const brandPath = path.join(categoryPath, brand);
                    
                    try {
                        const productFolders = fs.readdirSync(brandPath).filter(item => {
                            const itemPath = path.join(brandPath, item);
                            return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
                        });
                        
                        for (const productFolder of productFolders) {
                            const productPath = path.join(brandPath, productFolder);
                            const imageCount = countRepresentativeImages(productPath);
                            
                            results.totalProductFolders++;
                            
                            const productInfo = {
                                category: category,
                                brand: brand,
                                productName: productFolder,
                                path: productPath,
                                imageCount: imageCount
                            };
                            
                            if (imageCount === -1) {
                                results.errorCount++;
                            } else if (imageCount === 0) {
                                results.noImagesCount++;
                                results.missingProducts.push(productInfo);
                            } else if (imageCount === 1) {
                                results.normalCount++;
                                
                                const folderBasedInfo = parseFromFolderStructure(category, brand, productFolder);
                                folderBasedInfo.fullPath = productPath;
                                folderBasedInfo.source = 'final_image_v2';
                                results.imageList.push(folderBasedInfo);
                                
                            } else {
                                results.multipleImagesCount++;
                            }
                        }
                    } catch (error) {
                        // 브랜드 폴더 읽기 실패
                    }
                }
            } catch (error) {
                // 카테고리 폴더 읽기 실패
            }
        }
        
        results.successRate = results.totalProductFolders > 0 ? 
            ((results.normalCount / results.totalProductFolders) * 100).toFixed(1) : '0';
            
    } catch (error) {
        console.error('구조화된 폴더 처리 오류:', error.message);
    }
    
    return results;
}

function findExactMatches(missingProduct, allImagesArray) {
    const missingInfo = parseFromFolderStructure(
        missingProduct.category, 
        missingProduct.brand, 
        missingProduct.productName
    );
    
    const matches = [];
    
    for (const imageInfo of allImagesArray) {
        if (imageInfo.source === 'final_image_v2') continue;
        
        // 카테고리와 브랜드가 일치하는지 확인
        if (imageInfo.category !== missingInfo.category || 
            imageInfo.brand !== missingInfo.brand) {
            continue;
        }
        
        // 제품 번호가 정확히 일치하는지 확인
        if (missingInfo.productNumbers.length > 0 && imageInfo.productNumbers.length > 0) {
            // 두 배열을 정렬하여 일관된 비교 보장
            const missingNumbers = [...missingInfo.productNumbers].sort();
            const imageNumbers = [...imageInfo.productNumbers].sort();
            
            // 배열 길이와 모든 번호가 일치하는지 확인
            if (missingNumbers.length === imageNumbers.length && 
                missingNumbers.every((num, index) => num === imageNumbers[index])) {
                matches.push({
                    matchType: 'exact_number',
                    confidence: 100,
                    image: imageInfo,
                    matchedNumbers: missingNumbers
                });
            }
        }
    }
    
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches;
}

// 🚀 이미지 자동 복구 함수
function recoverImages() {
    console.log('🚀 이미지 자동 복구 시작...\n');
    
    const imageFolders = [
        { path: './final_image_v2', name: 'final_image_v2', type: 'structured' },
        { path: './images_missing_brands', name: 'images_missing_brands', type: 'flat' },
        { path: './images_final_collection', name: 'images_final_collection', type: 'flat' },
        { path: './images_ultimate', name: 'images_ultimate', type: 'flat' }
    ];
    
    const allImages = [];
    let v2Results = null;
    
    // 📂 모든 이미지 수집
    console.log('📂 이미지 데이터 수집 중...');
    
    for (const folder of imageFolders) {
        if (!fs.existsSync(folder.path)) {
            console.log(`⚠️ ${folder.name} 폴더가 존재하지 않습니다.`);
            continue;
        }
        
        if (folder.type === 'structured') {
            v2Results = processStructuredFolder(folder.path);
            allImages.push(...(v2Results.imageList || []));
        } else {
            const flatImages = collectImagesFromFlatFolder(folder.path, folder.name);
            allImages.push(...flatImages);
        }
    }
    
    if (!v2Results) {
        console.error('❌ final_image_v2 폴더를 찾을 수 없습니다.');
        return;
    }
    
    console.log(`✅ 총 ${allImages.length}개 이미지 정보 수집 완료`);
    console.log(`📊 final_image_v2 누락: ${v2Results.noImagesCount}개\n`);
    
    // 🔍 매칭 및 복구 작업
    console.log('🔍 매칭 분석 및 복구 작업 시작...');
    
    const recoveryResults = {
        totalProcessed: 0,
        successfulRecoveries: 0,
        failedRecoveries: 0,
        skipped: 0,
        recoveryLog: [],
        missingItems: []
    };
    
    for (const missingItem of v2Results.missingProducts || []) {
        recoveryResults.totalProcessed++;
        
        if (recoveryResults.totalProcessed % 1000 === 0) {
            console.log(`   진행률: ${recoveryResults.totalProcessed}/${v2Results.missingProducts.length}`);
        }
        
        const matches = findExactMatches(missingItem, allImages);
        
        if (matches.length > 0) {
            const bestMatch = matches[0];
            
            try {
                // 🎯 목적지 폴더 경로 생성
                const targetDir = path.join('./final_image_v2', missingItem.category, missingItem.brand, missingItem.productName);
                
                // 폴더가 존재하지 않으면 생성
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                
                // 🖼️ 이미지 파일 복사
                const sourceFile = bestMatch.image.fullPath;
                const fileName = path.basename(sourceFile);
                const targetFile = path.join(targetDir, fileName);
                
                // 파일이 이미 존재하지 않는 경우에만 복사
                if (!fs.existsSync(targetFile)) {
                    fs.copyFileSync(sourceFile, targetFile);
                    
                    recoveryResults.successfulRecoveries++;
                    recoveryResults.recoveryLog.push({
                        category: missingItem.category,
                        brand: missingItem.brand,
                        productName: missingItem.productName,
                        sourceFile: sourceFile,
                        targetFile: targetFile,
                        matchType: bestMatch.matchType,
                        matchedNumbers: bestMatch.matchedNumbers,
                        sourceFolder: bestMatch.image.source
                    });
                } else {
                    recoveryResults.skipped++;
                }
                
            } catch (error) {
                recoveryResults.failedRecoveries++;
                console.error(`❌ 복구 실패: ${missingItem.category}/${missingItem.brand}/${missingItem.productName}`, error.message);
            }
        } else {
            // 매칭되지 않은 항목은 실제 누락 목록에 추가
            recoveryResults.missingItems.push({
                category: missingItem.category,
                brand: missingItem.brand,
                productName: missingItem.productName,
                path: missingItem.path,
                status: 'missing',
                reason: 'no_matching_image_found'
            });
        }
    }
    
    // 📊 복구 결과 출력
    console.log('\n📊 === 이미지 복구 완료 ===');
    console.log(`처리된 누락 항목: ${recoveryResults.totalProcessed}개`);
    console.log(`✅ 성공적 복구: ${recoveryResults.successfulRecoveries}개`);
    console.log(`⏭️ 이미 존재: ${recoveryResults.skipped}개`);
    console.log(`❌ 복구 실패: ${recoveryResults.failedRecoveries}개`);
    console.log(`🚨 실제 누락: ${recoveryResults.missingItems.length}개`);
    
    const recoveryRate = recoveryResults.totalProcessed > 0 ? 
        ((recoveryResults.successfulRecoveries / recoveryResults.totalProcessed) * 100).toFixed(1) : '0';
    
    console.log(`📈 복구율: ${recoveryRate}%\n`);
    
    // 💾 복구 로그 저장
    const timestamp = new Date().toISOString().split('T')[0];
    
    // 복구 성공 로그
    fs.writeFileSync(`recovery_success_log_${timestamp}.json`, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
            totalProcessed: recoveryResults.totalProcessed,
            successfulRecoveries: recoveryResults.successfulRecoveries,
            failedRecoveries: recoveryResults.failedRecoveries,
            skipped: recoveryResults.skipped,
            recoveryRate: recoveryRate
        },
        recoveryDetails: recoveryResults.recoveryLog
    }, null, 2));
    
    console.log(`💾 복구 성공 로그: recovery_success_log_${timestamp}.json`);
    
    // 📋 실제 누락 항목을 카테고리별/브랜드별로 정리
    const organizedMissing = organizeMissingItems(recoveryResults.missingItems);
    
    // 실제 누락 JSON 저장
    fs.writeFileSync(`missing_images_todo_${timestamp}.json`, JSON.stringify({
        timestamp: new Date().toISOString(),
        summary: {
            totalMissing: recoveryResults.missingItems.length,
            categoryBreakdown: organizedMissing.categoryStats,
            brandBreakdown: organizedMissing.brandStats,
            priorityRecommendation: generatePriorityRecommendation(organizedMissing)
        },
        missingByCategory: organizedMissing.byCategory,
        missingByBrand: organizedMissing.byBrand,
        detailedList: recoveryResults.missingItems
    }, null, 2));
    
    console.log(`📋 누락 항목 정리: missing_images_todo_${timestamp}.json`);
    
    // 🎯 우선순위 권장사항 출력
    console.log('\n🎯 === 누락 항목 우선순위 권장사항 ===');
    const priorities = generatePriorityRecommendation(organizedMissing);
    priorities.forEach((item, index) => {
        console.log(`${index + 1}. ${item.category} - ${item.brand}: ${item.count}개 (${item.percentage}%)`);
    });
    
    console.log('\n🎉 이미지 복구 및 누락 정리 완료!');
    
    return {
        recoveryResults,
        organizedMissing,
        priorities
    };
}

// 📋 누락 항목 카테고리별/브랜드별 정리
function organizeMissingItems(missingItems) {
    const byCategory = {};
    const byBrand = {};
    const categoryStats = {};
    const brandStats = {};
    
    for (const item of missingItems) {
        // 카테고리별 정리
        if (!byCategory[item.category]) {
            byCategory[item.category] = {};
            categoryStats[item.category] = 0;
        }
        
        if (!byCategory[item.category][item.brand]) {
            byCategory[item.category][item.brand] = [];
        }
        
        byCategory[item.category][item.brand].push(item);
        categoryStats[item.category]++;
        
        // 브랜드별 정리
        const brandKey = `${item.category}_${item.brand}`;
        if (!byBrand[brandKey]) {
            byBrand[brandKey] = {
                category: item.category,
                brand: item.brand,
                items: []
            };
            brandStats[brandKey] = 0;
        }
        
        byBrand[brandKey].items.push(item);
        brandStats[brandKey]++;
    }
    
    return {
        byCategory,
        byBrand,
        categoryStats,
        brandStats
    };
}

// 🎯 우선순위 권장사항 생성
function generatePriorityRecommendation(organizedMissing) {
    const priorities = [];
    
    // 브랜드별 누락 수 계산
    Object.entries(organizedMissing.brandStats).forEach(([brandKey, count]) => {
        const brandInfo = organizedMissing.byBrand[brandKey];
        priorities.push({
            category: brandInfo.category,
            brand: brandInfo.brand,
            count: count,
            percentage: ((count / Object.values(organizedMissing.brandStats).reduce((a, b) => a + b, 0)) * 100).toFixed(1)
        });
    });
    
    // 누락 수 기준으로 내림차순 정렬
    priorities.sort((a, b) => b.count - a.count);
    
    return priorities.slice(0, 20); // 상위 20개만 반환
}

// 🗑️ 잘못 복구된 파일 삭제 함수
function undoIncorrectRecoveries(logFile) {
    console.log('🗑️ 잘못 복구된 파일 삭제 시작...\n');
    
    const undoResults = {
        totalProcessed: 0,
        deletedFiles: 0,
        failedDeletions: 0,
        skipped: 0,
        undoLog: []
    };
    
    try {
        // 복구 로그 파일 읽기
        if (!fs.existsSync(logFile)) {
            console.error(`❌ 로그 파일을 찾을 수 없습니다: ${logFile}`);
            return undoResults;
        }
        
        const logData = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        const recoveryDetails = logData.recoveryDetails || [];
        
        for (const recovery of recoveryDetails) {
            undoResults.totalProcessed++;
            
            const missingInfo = parseFromFolderStructure(
                recovery.category,
                recovery.brand,
                recovery.productName
            );
            
            const imageInfo = parseImageFileName(path.basename(recovery.sourceFile));
            
            // 제품 번호가 정확히 일치하는지 확인
            const missingNumbers = [...missingInfo.productNumbers].sort();
            const imageNumbers = [...imageInfo.productNumbers].sort();
            
            if (missingNumbers.length !== imageNumbers.length || 
                !missingNumbers.every((num, index) => num === imageNumbers[index])) {
                // 번호가 일치하지 않으면 삭제 대상
                try {
                    const targetFile = recovery.targetFile;
                    if (fs.existsSync(targetFile)) {
                        fs.unlinkSync(targetFile);
                        undoResults.deletedFiles++;
                        undoResults.undoLog.push({
                            category: recovery.category,
                            brand: recovery.brand,
                            productName: recovery.productName,
                            deletedFile: targetFile,
                            sourceFile: recovery.sourceFile,
                            matchedNumbers: recovery.matchedNumbers,
                            reason: 'incomplete_number_match'
                        });
                        
                        // 빈 폴더 정리
                        const targetDir = path.dirname(targetFile);
                        if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length === 0) {
                            fs.rmdirSync(targetDir);
                        }
                    } else {
                        undoResults.skipped++;
                        undoResults.undoLog.push({
                            category: recovery.category,
                            brand: recovery.brand,
                            productName: recovery.productName,
                            deletedFile: targetFile,
                            sourceFile: recovery.sourceFile,
                            matchedNumbers: recovery.matchedNumbers,
                            reason: 'file_already_missing'
                        });
                    }
                } catch (error) {
                    undoResults.failedDeletions++;
                    console.error(`❌ 파일 삭제 실패: ${recovery.targetFile}`, error.message);
                }
            } else {
                undoResults.skipped++;
            }
        }
        
        // 📊 삭제 결과 출력
        console.log('\n📊 === 잘못된 복구 파일 삭제 완료 ===');
        console.log(`처리된 항목: ${undoResults.totalProcessed}개`);
        console.log(`✅ 삭제 성공: ${undoResults.deletedFiles}개`);
        console.log(`⏭️ 이미 삭제됨/유효한 파일: ${undoResults.skipped}개`);
        console.log(`❌ 삭제 실패: ${undoResults.failedDeletions}개`);
        
        // 💾 삭제 로그 저장
        const timestamp = new Date().toISOString().split('T')[0];
        fs.writeFileSync(`undo_recovery_log_${timestamp}.json`, JSON.stringify({
            timestamp: new Date().toISOString(),
            summary: {
                totalProcessed: undoResults.totalProcessed,
                deletedFiles: undoResults.deletedFiles,
                failedDeletions: undoResults.failedDeletions,
                skipped: undoResults.skipped
            },
            undoDetails: undoResults.undoLog
        }, null, 2));
        
        console.log(`💾 삭제 로그: undo_recovery_log_${timestamp}.json`);
        
    } catch (error) {
        console.error('❌ 삭제 작업 중 오류 발생:', error.message);
    }
    
    return undoResults;
}

// 스크립트 실행
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] === 'undo' && args[1]) {
        undoIncorrectRecoveries(args[1]);
    } else {
        recoverImages();
    }
}

module.exports = { recoverImages, undoIncorrectRecoveries };
