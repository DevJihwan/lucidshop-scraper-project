const fs = require('fs');
const path = require('path');

// 이미지 파일 확장자 목록
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

// 파일이 이미지인지 확인
function isImageFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
}

// 파일명에 (대표)가 포함되어 있는지 확인
function isRepresentativeImage(filename) {
    return filename.includes('(대표)') && isImageFile(filename);
}

// 🆕 상품 번호 추출 함수
function extractProductNumber(text) {
    // 상품 번호 패턴: 숫자_숫자, 또는 숫자만
    const patterns = [
        /(\d{5,})_(\d{6,})/g,  // 12345_678901 형태
        /(\d{5,})/g           // 678901 형태 (5자리 이상)
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

// 🆕 정확한 이미지 파일명 파싱
function parseImageFileName(filename) {
    try {
        const nameWithoutExt = filename.replace(/\.(jpg|jpeg|png|gif|bmp|webp)$/i, '');
        
        // 공백을 언더스코어로 통일
        const normalizedName = nameWithoutExt.replace(/\s+/g, '_');
        const parts = normalizedName.split('_');
        
        if (parts.length >= 3) {
            const category = parts[0].toLowerCase().trim();
            const brand = parts[1].toLowerCase().trim();
            
            // 나머지 부분에서 상품 정보 추출
            let remainingParts = parts.slice(2);
            
            // 특수 표시 제거
            remainingParts = remainingParts.filter(part => 
                !part.includes('(대표)') && 
                !part.includes('(보완)') && 
                !part.includes('(타겟브랜드)') &&
                part !== 'recovered'
            );
            
            const productText = remainingParts.join('_');
            const productNumbers = extractProductNumber(productText);
            
            // 상품명에서 번호 제거
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

// 🆕 폴더명 기반 정보 추출 (final_image_v2용)
function parseFromFolderStructure(category, brand, productFolderName) {
    const productNumbers = extractProductNumber(productFolderName);
    
    // 상품명에서 번호 제거
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

// 폴더 내 대표 이미지 개수 확인
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

// 평면 구조 폴더에서 이미지 수집
function collectImagesFromFlatFolder(folderPath, folderName) {
    const images = [];
    
    if (!fs.existsSync(folderPath)) {
        console.log(`   ⚠️  ${folderName} 폴더가 존재하지 않습니다.`);
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
        
        console.log(`   📁 ${folderName}: ${images.length}개 이미지 발견`);
        
    } catch (error) {
        console.error(`   ❌ ${folderName} 폴더 읽기 오류:`, error.message);
    }
    
    return images;
}

// 구조화된 폴더 처리
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
                                
                                // 폴더 구조 기반 이미지 정보 생성
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

// 🆕 정확한 매칭 함수 (상품 번호 기준)
function findExactMatches(missingProduct, allImagesArray) {
    const missingInfo = parseFromFolderStructure(
        missingProduct.category, 
        missingProduct.brand, 
        missingProduct.productName
    );
    
    const matches = [];
    
    for (const imageInfo of allImagesArray) {
        // 다른 폴더의 이미지만 검사
        if (imageInfo.source === 'final_image_v2') continue;
        
        // 1. 카테고리와 브랜드가 일치해야 함
        if (imageInfo.category !== missingInfo.category || 
            imageInfo.brand !== missingInfo.brand) {
            continue;
        }
        
        // 2. 상품 번호가 있는 경우 정확히 일치해야 함
        if (missingInfo.productNumbers.length > 0 && imageInfo.productNumbers.length > 0) {
            const hasMatchingNumber = missingInfo.productNumbers.some(missingNum => 
                imageInfo.productNumbers.some(imageNum => imageNum === missingNum)
            );
            
            if (hasMatchingNumber) {
                matches.push({
                    matchType: 'exact_number',
                    confidence: 100,
                    image: imageInfo,
                    matchedNumbers: missingInfo.productNumbers.filter(missingNum => 
                        imageInfo.productNumbers.includes(missingNum)
                    )
                });
            }
        }
        
        // 3. 상품 번호가 없는 경우 상품명으로 매칭
        else if (missingInfo.productNumbers.length === 0 && imageInfo.productNumbers.length === 0) {
            if (missingInfo.productName && imageInfo.productName) {
                // 상품명 유사도 검사
                const similarity = calculateSimilarity(missingInfo.productName, imageInfo.productName);
                
                if (similarity > 0.8) { // 80% 이상 유사
                    matches.push({
                        matchType: 'name_similarity',
                        confidence: Math.round(similarity * 100),
                        image: imageInfo,
                        similarity: similarity
                    });
                }
            }
        }
    }
    
    // 신뢰도 순으로 정렬
    matches.sort((a, b) => b.confidence - a.confidence);
    
    return matches;
}

// 🆕 문자열 유사도 계산 (Levenshtein distance 기반)
function calculateSimilarity(str1, str2) {
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

// 🎯 정확한 매칭으로 이미지 검사
function preciseImageCheck() {
    console.log('🔍 정확한 상품 번호 매칭으로 검사 시작...\n');
    
    // 검사할 폴더들 정의
    const imageFolders = [
        { path: './final_image_v2', name: 'final_image_v2', type: 'structured' },
        { path: './images_missing_brands', name: 'images_missing_brands', type: 'flat' },
        { path: './images_final_collection', name: 'images_final_collection', type: 'flat' },
        { path: './images_ultimate', name: 'images_ultimate', type: 'flat' }
    ];
    
    const allImages = []; // 모든 이미지 정보 배열
    const folderStats = {};
    
    // 각 폴더별 이미지 수집
    console.log('📂 === 각 폴더별 이미지 수집 ===');
    
    for (const folder of imageFolders) {
        console.log(`\n🔍 ${folder.name} 폴더 검사 중...`);
        
        folderStats[folder.name] = {
            totalImages: 0,
            representativeImages: 0,
            categories: {},
            exists: fs.existsSync(folder.path)
        };
        
        if (!folderStats[folder.name].exists) {
            console.log(`   ❌ 폴더가 존재하지 않습니다: ${folder.path}`);
            continue;
        }
        
        if (folder.type === 'structured') {
            // final_image_v2의 구조화된 폴더 처리
            const structuredResults = processStructuredFolder(folder.path);
            folderStats[folder.name] = { 
                ...folderStats[folder.name], 
                ...structuredResults,
                totalImages: structuredResults.imageList.length,
                representativeImages: structuredResults.imageList.filter(img => img.isRepresentative).length
            };
            
            // 카테고리별 통계
            for (const imageInfo of structuredResults.imageList || []) {
                if (!folderStats[folder.name].categories[imageInfo.category]) {
                    folderStats[folder.name].categories[imageInfo.category] = 0;
                }
                folderStats[folder.name].categories[imageInfo.category]++;
            }
            
            // 배열에 추가
            allImages.push(...(structuredResults.imageList || []));
            
        } else {
            // 평면 구조 폴더 처리
            const flatImages = collectImagesFromFlatFolder(folder.path, folder.name);
            folderStats[folder.name].totalImages = flatImages.length;
            folderStats[folder.name].representativeImages = flatImages.filter(img => img.isRepresentative).length;
            
            // 카테고리별 통계
            for (const image of flatImages) {
                if (!folderStats[folder.name].categories[image.category]) {
                    folderStats[folder.name].categories[image.category] = 0;
                }
                folderStats[folder.name].categories[image.category]++;
            }
            
            // 배열에 추가
            allImages.push(...flatImages);
        }
    }
    
    // 통합 분석
    console.log('\n📊 === 전체 폴더 통계 요약 ===');
    
    for (const [folderName, stats] of Object.entries(folderStats)) {
        if (!stats.exists) continue;
        
        console.log(`\n📁 ${folderName}:`);
        console.log(`   총 이미지: ${stats.totalImages}개`);
        console.log(`   대표 이미지: ${stats.representativeImages}개`);
        
        if (stats.categories && Object.keys(stats.categories).length > 0) {
            console.log(`   카테고리별:`);
            Object.entries(stats.categories).forEach(([category, count]) => {
                console.log(`      ${category}: ${count}개`);
            });
        }
    }
    
    // 정확한 누락 분석
    console.log('\n🔍 === 정확한 상품 번호 기준 누락 분석 ===');
    
    let v2Results = null;
    let exactMatches = 0;
    let nameMatches = 0;
    let reallyMissing = 0;
    const matchDetails = [];
    
    if (folderStats['final_image_v2'] && folderStats['final_image_v2'].exists) {
        v2Results = folderStats['final_image_v2'];
        
        console.log(`\nfinal_image_v2 현황:`);
        console.log(`   상품 폴더: ${v2Results.totalProductFolders}개`);
        console.log(`   정상 (이미지 1개): ${v2Results.normalCount}개`);
        console.log(`   누락 (이미지 0개): ${v2Results.noImagesCount}개`);
        console.log(`   정상률: ${v2Results.successRate}%`);
        
        console.log('\n🔍 정확한 매칭 로직으로 누락 상품 검사 중...');
        
        let processedCount = 0;
        
        for (const missingItem of v2Results.missingProducts || []) {
            processedCount++;
            
            if (processedCount % 1000 === 0) {
                console.log(`   진행률: ${processedCount}/${v2Results.missingProducts.length} (${((processedCount / v2Results.missingProducts.length) * 100).toFixed(1)}%)`);
            }
            
            const matches = findExactMatches(missingItem, allImages);
            
            if (matches.length > 0) {
                const bestMatch = matches[0];
                
                if (bestMatch.matchType === 'exact_number') {
                    exactMatches++;
                } else if (bestMatch.matchType === 'name_similarity') {
                    nameMatches++;
                }
                
                matchDetails.push({
                    missing: missingItem,
                    matches: matches.slice(0, 1) // 최고 매치만 저장
                });
            } else {
                reallyMissing++;
            }
        }
        
        const totalFound = exactMatches + nameMatches;
        
        console.log(`\n📊 정확한 매칭 분석 결과:`);
        console.log(`   final_image_v2 누락: ${v2Results.noImagesCount}개`);
        console.log(`   상품번호 정확 매칭: ${exactMatches}개`);
        console.log(`   상품명 유사 매칭: ${nameMatches}개`);
        console.log(`   총 발견: ${totalFound}개`);
        console.log(`   실제 누락: ${reallyMissing}개`);
        console.log(`   실제 누락률: ${((reallyMissing / v2Results.totalProductFolders) * 100).toFixed(1)}%`);
        
        // 매칭 상세 정보 샘플 출력
        if (matchDetails.length > 0) {
            console.log(`\n🔍 정확한 매칭 예시 (상위 10개):`);
            matchDetails.slice(0, 10).forEach((detail, index) => {
                console.log(`   ${index + 1}. [${detail.missing.category}/${detail.missing.brand}] ${detail.missing.productName}`);
                detail.matches.forEach(match => {
                    if (match.matchType === 'exact_number') {
                        console.log(`      → ✅ 상품번호 일치 (${match.confidence}%): ${match.image.source} - ${match.matchedNumbers.join(', ')}`);
                    } else {
                        console.log(`      → 📝 상품명 유사 (${match.confidence}%): ${match.image.source} - ${match.image.filename}`);
                    }
                });
            });
        }
    }
    
    // 결과 저장
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            totalFolders: imageFolders.length,
            folderStats: folderStats,
            v2Comparison: v2Results ? {
                v2ProductFolders: v2Results.totalProductFolders || 0,
                v2Missing: v2Results.noImagesCount || 0,
                exactMatches: exactMatches,
                nameMatches: nameMatches,
                totalFound: exactMatches + nameMatches,
                reallyMissing: reallyMissing,
                recoveryRate: v2Results.noImagesCount > 0 ? (((exactMatches + nameMatches) / v2Results.noImagesCount) * 100).toFixed(1) : '0'
            } : null
        },
        matchDetails: matchDetails.slice(0, 50) // 상위 50개 매칭 정보만 저장
    };
    
    fs.writeFileSync('precise_image_analysis_report.json', JSON.stringify(report, null, 2));
    console.log('\n💾 정확한 분석 결과가 "precise_image_analysis_report.json" 파일에 저장되었습니다.');
    
    // 최종 결론
    console.log('\n🎉 === 정확한 매칭 검사 완료 ===');
    
    if (v2Results && typeof reallyMissing !== 'undefined') {
        const recoveryRate = v2Results.noImagesCount > 0 ? 
            (((exactMatches + nameMatches) / v2Results.noImagesCount) * 100).toFixed(1) : '0';
        
        console.log(`정확한 복구 가능률: ${recoveryRate}% (${exactMatches + nameMatches}/${v2Results.noImagesCount})`);
        console.log(`  - 상품번호 정확 매칭: ${exactMatches}개`);
        console.log(`  - 상품명 유사 매칭: ${nameMatches}개`);
        
        if (reallyMissing < 100) {
            console.log(`🏆 매우 우수: 실제 누락이 ${reallyMissing}개로 매우 적습니다!`);
        } else if (reallyMissing < 1000) {
            console.log(`✅ 양호: 실제 누락이 ${reallyMissing}개로 관리 가능한 수준입니다.`);
        } else if (reallyMissing < 3000) {
            console.log(`⚠️ 개선 필요: 실제 누락이 ${reallyMissing}개로 추가 작업이 필요합니다.`);
        } else {
            console.log(`🚨 대량 누락: 실제 누락이 ${reallyMissing}개로 대규모 복구 작업이 필요합니다.`);
        }
    }
}

// 스크립트 실행
if (require.main === module) {
    preciseImageCheck();
}

module.exports = { preciseImageCheck };