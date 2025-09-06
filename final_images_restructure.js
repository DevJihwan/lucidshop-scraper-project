const fs = require('fs');
const path = require('path');

// 한글 폴더명을 안전한 형태로 변환하는 함수
function sanitizeFolderName(name) {
    // 특수문자 제거 및 공백을 언더스코어로 변경
    return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').trim();
}

// savedImageName에서 고유 폴더명을 생성하는 함수
function generateFolderName(savedImageName) {
    // "가방_고야드 19FW 트렁크 스트랩백 그레이_18791(대표).jpg" 형태에서
    // 카테고리를 제외하고 나머지 부분을 폴더명으로 사용
    const nameWithoutExtension = savedImageName.replace(/\.(jpg|jpeg|png|gif|bmp|webp)$/i, '');
    const parts = nameWithoutExtension.split('_');
    
    if (parts.length >= 3) {
        // 카테고리(첫 번째 부분) 제외하고 나머지를 합침
        const folderName = parts.slice(1).join('_');
        return sanitizeFolderName(folderName);
    }
    
    // 파싱 실패시 원본 파일명 사용
    return sanitizeFolderName(nameWithoutExtension);
}

// 기존 final_images에서 이미지 파일을 찾는 함수
function findImageInOriginalFolder(savedImageName, originalImagesPath) {
    const categories = ['가방', '시계', '신발', '지갑', '악세사리'];
    
    for (const category of categories) {
        const categoryPath = path.join(originalImagesPath, category);
        if (!fs.existsSync(categoryPath)) continue;
        
        try {
            const subFolders = fs.readdirSync(categoryPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            for (const subFolder of subFolders) {
                const subFolderPath = path.join(categoryPath, subFolder);
                try {
                    const files = fs.readdirSync(subFolderPath);
                    
                    for (const file of files) {
                        if (file === savedImageName) {
                            return path.join(subFolderPath, file);
                        }
                    }
                } catch (error) {
                    console.warn(`하위 폴더 읽기 실패: ${subFolderPath}`, error.message);
                }
            }
        } catch (error) {
            console.warn(`카테고리 폴더 읽기 실패: ${categoryPath}`, error.message);
        }
    }
    
    return null;
}

// 메인 재구성 함수
async function restructureFinalImages() {
    const dataFolderPath = './final_data';
    const originalImagesPath = './final_images';
    const newImagesPath = './final_image_v2';
    
    console.log('🔄 이미지 폴더 재구성 시작...\n');
    
    // 데이터 폴더 확인
    if (!fs.existsSync(dataFolderPath)) {
        console.error(`❌ 데이터 폴더를 찾을 수 없습니다: ${dataFolderPath}`);
        return;
    }
    
    // 카테고리 파일들 찾기
    const categoryFiles = fs.readdirSync(dataFolderPath)
        .filter(file => file.endsWith('_products.json'))
        .map(file => path.join(dataFolderPath, file));
    
    if (categoryFiles.length === 0) {
        console.error('❌ 카테고리 데이터 파일을 찾을 수 없습니다.');
        return;
    }
    
    console.log(`📋 발견된 카테고리 파일: ${categoryFiles.length}개`);
    categoryFiles.forEach(file => console.log(`   - ${path.basename(file)}`));
    console.log();
    
    // 원본 이미지 폴더 확인
    if (!fs.existsSync(originalImagesPath)) {
        console.error(`❌ 원본 이미지 폴더를 찾을 수 없습니다: ${originalImagesPath}`);
        return;
    }
    
    // 새 폴더 생성
    if (fs.existsSync(newImagesPath)) {
        console.log(`⚠️  기존 ${newImagesPath} 폴더가 존재합니다. 삭제 후 재생성합니다.`);
        fs.rmSync(newImagesPath, { recursive: true, force: true });
    }
    fs.mkdirSync(newImagesPath, { recursive: true });
    
    try {
        const totalStats = {
            total: 0,
            success: 0,
            notFound: 0,
            error: 0,
            categories: {}
        };
        
        // 각 카테고리 파일 처리
        for (const categoryFile of categoryFiles) {
            const categoryName = path.basename(categoryFile).replace('_products.json', '');
            console.log(`\n🔄 ${categoryName} 카테고리 처리 중...`);
            
            // JSON 파일 읽기
            const rawData = fs.readFileSync(categoryFile, 'utf8');
            const data = JSON.parse(rawData);
            
            if (!data.products || !Array.isArray(data.products)) {
                console.error(`❌ ${categoryName} 데이터 파일 형식이 올바르지 않습니다.`);
                continue;
            }
            
            console.log(`📖 ${data.products.length}개 ${categoryName} 상품 로드 완료`);
            
            const categoryStats = {
                total: data.products.length,
                success: 0,
                notFound: 0,
                error: 0
            };
            
            // 각 상품 처리
            for (let i = 0; i < data.products.length; i++) {
                const product = data.products[i];
                const progress = ((i + 1) / data.products.length * 100).toFixed(1);
                
                if (!product.savedImageName || !product.categoryName) {
                    if (i % 500 === 0 || i === data.products.length - 1) {
                        console.log(`⚠️  [${progress}%] 건너뜀: 필수 정보 누락`);
                    }
                    categoryStats.error++;
                    continue;
                }
                
                try {
                    const category = product.categoryName;
                    const brandName = product.brandName || '기타'; // 브랜드명이 없는 경우 '기타'로 분류
                    const savedImageName = product.savedImageName;
                    const folderName = generateFolderName(savedImageName);
                    
                    // 새 폴더 경로 생성 (카테고리/브랜드/상품폴더)
                    const categoryPath = path.join(newImagesPath, category);
                    const brandPath = path.join(categoryPath, sanitizeFolderName(brandName));
                    const productFolderPath = path.join(brandPath, folderName);
                    
                    // 폴더 생성
                    fs.mkdirSync(productFolderPath, { recursive: true });
                    
                    // 원본 이미지 파일 찾기
                    const originalImagePath = findImageInOriginalFolder(savedImageName, originalImagesPath);
                    
                    if (originalImagePath && fs.existsSync(originalImagePath)) {
                        // 새 위치로 복사
                        const newImagePath = path.join(productFolderPath, savedImageName);
                        fs.copyFileSync(originalImagePath, newImagePath);
                        
                        if (i % 500 === 0 || i === data.products.length - 1) {
                            console.log(`✅ [${progress}%] ${category}/${brandName}/${folderName} 생성 완료`);
                        }
                        
                        categoryStats.success++;
                    } else {
                        if (i % 1000 === 0) {
                            console.log(`❌ [${progress}%] 이미지 찾을 수 없음: ${savedImageName}`);
                        }
                        categoryStats.notFound++;
                    }
                    
                } catch (error) {
                    if (i % 1000 === 0) {
                        console.error(`❌ [${progress}%] 처리 중 오류: ${product.productName}`, error.message);
                    }
                    categoryStats.error++;
                }
            }
            
            // 카테고리별 결과 출력
            console.log(`📊 ${categoryName} 완료: ✅ ${categoryStats.success}개 | ❌ ${categoryStats.notFound}개 | 🚫 ${categoryStats.error}개`);
            
            // 전체 통계에 합산
            totalStats.total += categoryStats.total;
            totalStats.success += categoryStats.success;
            totalStats.notFound += categoryStats.notFound;
            totalStats.error += categoryStats.error;
            totalStats.categories[categoryName] = categoryStats;
        }
        
        // 결과 요약
        console.log('\n📊 === 전체 재구성 결과 요약 ===');
        console.log(`🔸 총 상품 수: ${totalStats.total}개`);
        console.log(`✅ 성공: ${totalStats.success}개 (${(totalStats.success/totalStats.total*100).toFixed(1)}%)`);
        console.log(`❌ 이미지 없음: ${totalStats.notFound}개 (${(totalStats.notFound/totalStats.total*100).toFixed(1)}%)`);
        console.log(`🚫 처리 오류: ${totalStats.error}개 (${(totalStats.error/totalStats.total*100).toFixed(1)}%)`);
        
        console.log('\n📋 === 카테고리별 상세 결과 ===');
        for (const [categoryName, categoryStats] of Object.entries(totalStats.categories)) {
            const total = categoryStats.total;
            const successRate = (categoryStats.success/total*100).toFixed(1);
            console.log(`${categoryName}: 총 ${total}개 | ✅ ${categoryStats.success}개 (${successRate}%) | ❌ ${categoryStats.notFound}개 | 🚫 ${categoryStats.error}개`);
        }
        
        // 상세 로그 저장
        const reportData = {
            timestamp: new Date().toISOString(),
            summary: totalStats,
            newStructurePath: newImagesPath,
            originalStructurePath: originalImagesPath,
            processedFiles: categoryFiles.map(file => path.basename(file))
        };
        
        fs.writeFileSync('final_images_restructure_report.json', JSON.stringify(reportData, null, 2));
        console.log('\n💾 상세 결과가 "final_images_restructure_report.json" 파일에 저장되었습니다.');
        console.log(`\n🎉 모든 카테고리 이미지 폴더 재구성이 완료되었습니다!`);
        console.log(`📁 새 폴더: ${newImagesPath}`);
        
    } catch (error) {
        console.error('❌ 처리 중 오류 발생:', error.message);
    }
}

// 폴더 구조 검증 함수
function validateNewStructure() {
    const newImagesPath = './final_image_v2';
    
    if (!fs.existsSync(newImagesPath)) {
        console.error('❌ 새 이미지 폴더가 존재하지 않습니다.');
        return;
    }
    
    console.log('\n🔍 새 폴더 구조 검증 중...');
    
    const categories = fs.readdirSync(newImagesPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    let totalBrands = 0;
    let totalFolders = 0;
    let totalImages = 0;
    
    for (const category of categories) {
        const categoryPath = path.join(newImagesPath, category);
        const brands = fs.readdirSync(categoryPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        let categoryFolders = 0;
        let categoryImages = 0;
        
        for (const brand of brands) {
            const brandPath = path.join(categoryPath, brand);
            const productFolders = fs.readdirSync(brandPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory());
            
            for (const folder of productFolders) {
                const folderPath = path.join(brandPath, folder.name);
                const images = fs.readdirSync(folderPath)
                    .filter(file => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file));
                categoryImages += images.length;
            }
            
            categoryFolders += productFolders.length;
        }
        
        console.log(`📁 ${category}: ${brands.length}개 브랜드, ${categoryFolders}개 상품 폴더, ${categoryImages}개 이미지`);
        totalBrands += brands.length;
        totalFolders += categoryFolders;
        totalImages += categoryImages;
    }
    
    console.log(`\n📊 전체: ${totalBrands}개 브랜드, ${totalFolders}개 상품 폴더, ${totalImages}개 이미지`);
}

// 스크립트 실행
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--validate')) {
        validateNewStructure();
    } else {
        restructureFinalImages().then(() => {
            validateNewStructure();
        });
    }
}

module.exports = { restructureFinalImages, validateNewStructure };