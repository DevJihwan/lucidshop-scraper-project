const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class Final3ItemsCollector {
    constructor() {
        this.baseUrl = 'https://lucidshop.kr';
        this.finalImagePath = './final_image_v2';
        
        // 수기로 제공받은 3건의 데이터
        this.finalItems = [
            {
                title: "리버서블 애너그램 벨트",
                productName: "로에베_리버서블_애너그램_벨트_1756371000(대표)",
                detailUrl: "https://lucidshop.kr/shop/item.php?it_id=1756371000",
                productId: "1756371000",
                currentPrice: "240,000원",
                originalPrice: "740,000원",
                category: "악세사리",
                brand: "로에베",
                categoryName: "벨트"
            },
            {
                title: "클래식 송아지 가죽 벨트",
                productName: "로에베_클래식_송아지_가죽_벨트_1756370788(대표)",
                detailUrl: "https://lucidshop.kr/shop/item.php?it_id=1756370788",
                productId: "1756370788",
                currentPrice: "220,000원",
                originalPrice: "740,000원",
                category: "악세사리",
                brand: "로에베",
                categoryName: "벨트"
            },
            {
                title: "클래식 송아지 가죽 벨트",
                productName: "로에베_클래식_송아지_가죽_벨트_1756370725(대표)",
                detailUrl: "https://lucidshop.kr/shop/item.php?it_id=1756370725",
                productId: "1756370725",
                currentPrice: "220,000원",
                originalPrice: "740,000원",
                category: "악세사리",
                brand: "로에베",
                categoryName: "벨트"
            }
        ];
        
        this.results = [];
        this.stats = {
            totalAttempted: 0,
            successCount: 0,
            failedCount: 0,
            imageDownloaded: 0,
            folderCreated: 0
        };
        
        console.log('최종 실패 3건 전용 수집 스크립트 초기화...');
    }

    async executeCollection() {
        console.log('====== 최종 실패 3건 수집 시작 ======\n');
        
        for (let i = 0; i < this.finalItems.length; i++) {
            const item = this.finalItems[i];
            const itemIndex = i + 1;
            
            console.log(`\n[${itemIndex}/3] 수집 중...`);
            console.log(`대상: [${item.category}/${item.brand}] ${item.title}`);
            console.log(`상품 ID: ${item.productId}`);
            console.log(`상세 URL: ${item.detailUrl}`);
            
            try {
                this.stats.totalAttempted++;
                
                const success = await this.collectSingleItem(item);
                
                if (success) {
                    console.log(`   ✅ 수집 성공`);
                    this.stats.successCount++;
                    this.results.push({
                        ...item,
                        status: 'success',
                        collectedAt: new Date().toISOString()
                    });
                } else {
                    throw new Error('이미지 수집 실패');
                }
                
            } catch (error) {
                console.log(`   ❌ 수집 실패: ${error.message}`);
                this.stats.failedCount++;
                this.results.push({
                    ...item,
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
            }
            
            // 딜레이 (서버 부하 방지)
            if (itemIndex < this.finalItems.length) {
                await this.delay(2000);
            }
        }
        
        await this.generateFinalReport();
        
        console.log('\n====== 최종 실패 3건 수집 완료 ======');
        
        return this.results;
    }

    async collectSingleItem(item) {
        try {
            console.log(`   상세 페이지에서 이미지 추출 중...`);
            
            // 상세 페이지에서 이미지 추출
            const imageUrls = await this.extractImagesFromDetailPage(item.detailUrl);
            
            if (imageUrls.length === 0) {
                throw new Error('상세 페이지에서 유효한 이미지를 찾을 수 없음');
            }
            
            console.log(`   발견된 이미지: ${imageUrls.length}개`);
            
            // 대표이미지 다운로드 (첫 번째 이미지)
            const representativeImageUrl = imageUrls[0];
            console.log(`   대표이미지 URL: ${representativeImageUrl}`);
            
            const downloadResult = await this.downloadAndSaveImage(
                representativeImageUrl,
                item.category,
                item.brand,
                item.title,
                item.productId
            );
            
            if (downloadResult.success) {
                console.log(`   이미지 저장 성공: ${downloadResult.fileName} (${(downloadResult.fileSize / 1024).toFixed(1)}KB)`);
                this.stats.imageDownloaded++;
                return true;
            } else {
                throw new Error(`이미지 다운로드 실패: ${downloadResult.error}`);
            }
            
        } catch (error) {
            console.log(`   수집 오류: ${error.message}`);
            return false;
        }
    }

    async extractImagesFromDetailPage(detailUrl) {
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
            console.log(`     sit_pvi_big 영역에서 대표이미지 검색...`);
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
                        console.log(`     ✓ 대표이미지 발견: ${normalizedUrl}`);
                    }
                }
            }
            
            // 2. 상세이미지 추출 (sit_inf_explan 영역)
            if (imageUrls.length === 0) {
                console.log(`     sit_inf_explan 영역에서 상세이미지 검색...`);
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
                            console.log(`     ✓ 상세이미지 발견: ${normalizedUrl}`);
                            break; // 첫 번째 상세이미지만 사용
                        }
                    }
                }
            }
            
            // 3. 백업: 일반 img 태그에서 검색
            if (imageUrls.length === 0) {
                console.log(`     백업 방식으로 이미지 검색...`);
                const backupImageRegex = /<img[^>]*src=["']([^"']*(?:data\/item|thumb)[^"']*)["'][^>]*>/gi;
                let backupMatch;
                
                while ((backupMatch = backupImageRegex.exec(html)) !== null) {
                    const src = backupMatch[1];
                    const normalizedUrl = this.normalizeImageUrl(src);
                    
                    if (this.isValidProductImage(normalizedUrl) && !imageUrls.includes(normalizedUrl)) {
                        imageUrls.push(normalizedUrl);
                        console.log(`     ✓ 백업 이미지 발견: ${normalizedUrl}`);
                        break; // 첫 번째 유효 이미지만 사용
                    }
                }
            }
            
            return imageUrls;
            
        } catch (error) {
            console.log(`     상세 페이지 접근 오류: ${error.message}`);
            return [];
        }
    }

    isValidProductImage(url) {
        if (!url || typeof url !== 'string') return false;
        if (!url.includes('http')) return false;
        
        // facebook.png 등 제외
        const excludePatterns = [
            'facebook.png', 'twitter.png', 'instagram.png',
            'icon_', 'ico_', 'btn_', 'logo_', 'banner_'
        ];
        
        for (const pattern of excludePatterns) {
            if (url.toLowerCase().includes(pattern.toLowerCase())) {
                console.log(`     ❌ 제외된 이미지: ${url} (${pattern} 포함)`);
                return false;
            }
        }
        
        // 유효한 이미지 경로
        const includePatterns = ['data/item', 'data/editor', 'thumb', 'trendell.store'];
        const isValid = includePatterns.some(pattern => 
            url.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (!isValid) {
            console.log(`     ❌ 유효하지 않은 이미지 경로: ${url}`);
        }
        
        return isValid;
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

    async downloadAndSaveImage(imageUrl, category, brand, productTitle, productId) {
        try {
            if (!this.isValidProductImage(imageUrl)) {
                throw new Error('유효하지 않은 이미지 URL');
            }
            
            console.log(`       이미지 다운로드 중: ${imageUrl}`);
            
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

            if (response.data.byteLength < 1000) {
                throw new Error('이미지 파일이 너무 작음 (1KB 미만)');
            }

            const contentType = response.headers['content-type'] || '';
            let extension = '.jpg';
            if (contentType.includes('png')) extension = '.png';
            else if (contentType.includes('gif')) extension = '.gif';
            else if (contentType.includes('webp')) extension = '.webp';

            const timestamp = Date.now() % 1000000;
            const cleanProductTitle = productTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
            const fileName = `${cleanProductTitle}_${productId}_${timestamp}(대표_최종)${extension}`;
            
            const targetDir = path.join(this.finalImagePath, category, brand, productTitle);
            
            try {
                await fs.access(targetDir);
                console.log(`       폴더 존재함: ${targetDir}`);
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

    async generateFinalReport() {
        const report = {
            completionDateTime: new Date().toISOString(),
            method: 'manual_final_3_items_collection',
            version: '1.0',
            description: '수기 제공된 최종 실패 3건 전용 수집',
            totalItems: this.finalItems.length,
            results: {
                totalAttempted: this.stats.totalAttempted,
                successCount: this.stats.successCount,
                failedCount: this.stats.failedCount,
                successRate: this.stats.totalAttempted > 0 ? 
                    ((this.stats.successCount / this.stats.totalAttempted) * 100).toFixed(1) + '%' : '0%'
            },
            detailedStats: {
                imageDownloaded: this.stats.imageDownloaded,
                folderCreated: this.stats.folderCreated
            },
            items: this.results,
            targetItems: [
                {
                    name: "로에베 리버서블 애너그램 벨트",
                    productId: "1756371000",
                    detailUrl: "https://lucidshop.kr/shop/item.php?it_id=1756371000"
                },
                {
                    name: "로에베 클래식 송아지 가죽 벨트 (788)",
                    productId: "1756370788", 
                    detailUrl: "https://lucidshop.kr/shop/item.php?it_id=1756370788"
                },
                {
                    name: "로에베 클래식 송아지 가죽 벨트 (725)",
                    productId: "1756370725",
                    detailUrl: "https://lucidshop.kr/shop/item.php?it_id=1756370725"
                }
            ]
        };
        
        await fs.writeFile('./final_3_items_collection_report.json', JSON.stringify(report, null, 2));
        
        console.log('\n📊 === 최종 3건 수집 보고서 ===');
        console.log(`수집 대상: ${report.totalItems}개 (로에베 벨트 제품)`);
        console.log(`수집 성공: ${report.results.successCount}개 (${report.results.successRate})`);
        console.log(`수집 실패: ${report.results.failedCount}개`);
        console.log(`이미지 다운로드: ${report.detailedStats.imageDownloaded}개`);
        console.log(`폴더 생성: ${report.detailedStats.folderCreated}개`);
        
        if (report.results.failedCount > 0) {
            console.log('\n❌ 실패 항목:');
            this.results.filter(item => item.status === 'failed').forEach((item, index) => {
                console.log(`${index + 1}. ${item.title} (ID: ${item.productId})`);
                console.log(`   └─ ${item.error}`);
            });
        }
        
        console.log('\n✅ 성공 항목:');
        this.results.filter(item => item.status === 'success').forEach((item, index) => {
            console.log(`${index + 1}. ${item.title} (ID: ${item.productId})`);
        });
        
        console.log(`\n💾 상세 보고서: final_3_items_collection_report.json`);
        
        return report;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 메인 실행 함수
async function main() {
    const collector = new Final3ItemsCollector();
    
    try {
        console.log('====== 최종 실패 3건 전용 수집 시작 ======');
        console.log('수기 제공 데이터 기반 직접 수집\n');
        
        const results = await collector.executeCollection();
        
        console.log('\n====== 최종 실패 3건 수집 완료 ======');
        console.log('로에베 벨트 제품 3건 수집 작업 완료!');
        
        return results;
        
    } catch (error) {
        console.error('수집 작업 중 오류:', error);
        throw error;
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = Final3ItemsCollector;