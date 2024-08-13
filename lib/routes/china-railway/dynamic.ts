import { DataItem, Route } from '@/types';
import logger from '@/utils/logger';
import puppeteer from '@/utils/puppeteer';
import { CompanyInfoDataWrapper, RecruitmentData } from './recruitment';
import dayjs from 'dayjs';
import cache from '@/utils/cache';

export const route: Route = {
    path: '/dynamic',
    example: '/china-railway/dynamic',
    url: 'rczp.china-railway.com.cn',
    categories: ['government'],
    name: '招聘动态',
    maintainers: ['anonymous'],
    handler: async (ctx) => {
        const baseUrl = 'https://rczp.china-railway.com.cn/'; // page/recruitment/rec_info.html

        const link = `${baseUrl}page/recruitment/rec_dynamic.html`;

        const browser = await puppeteer();

        const page = await browser.newPage();

        logger.http(`Requesting ${link}`);

        await page.goto(link, {
            waitUntil: 'domcontentloaded',
        });

        logger.info(page.url());
        // 拦截招聘动态的返回数据
        const response = await page.waitForResponse((res) => {
            logger.info(res.url());

            if (res.url().includes('pagedynamic')) {
                logger.info(`Get ====> ${res.url()}`);
            }
            return res.url().includes('pagedynamic');
        });
        const responseJson: RecruitmentData[] = (await response.json()).obj.records;

        // 已经关闭的招聘动态
        const itemsClosed: DataItem[] = responseJson
            .filter((i) => Number.parseInt(i.infostate) === 2)
            .map((entry) => ({
                title: entry.doctitle,
                link: `https://rczp.china-railway.com.cn/page/platform/company_dynamic_del.html?parentId=${entry.parentId}&jmetazpdtid=${entry.docid}`,
                author: entry.organ,
                pubDate: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
                updated: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
                description: `该招聘动态的有效期截止到${dayjs(entry.invalidtime).format('MM/DD/YYYY')}，目前已结束，无法查看详细内容。`,
            }));

        // 可以查看的招聘动态
        // const fetchDetailInfo = async (entry: RecruitmentData): Promise<DataItem> => {
        //     const deepLink = `https://rczp.china-railway.com.cn/page/platform/company_dynamic_del.html?parentId=${entry.parentId}&jmetazpdtid=${entry.docid}`;
        //     const newPage = await browser.newPage();
        //     logger.info(`Goto: ${deepLink}`);
        //     await newPage.goto(deepLink, { waitUntil: 'domcontentloaded' });

        //     const deepLinkResponse = await newPage.waitForResponse((res) => {
        //         logger.info(res.url());

        //         if (res.url().includes('getInfoZpdt')) {
        //             logger.info(`Get ====> ${res.url()}`);
        //         }
        //         return res.url().includes('getInfoZpdt');
        //     });
        //     const deepLinkResponseJson: CompanyInfoDataWrapper = await deepLinkResponse.json();
        //     await newPage.close();

        //     return {
        //         title: entry.doctitle,
        //         link: deepLink,
        //         pubDate: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
        //         updated: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
        //         author: entry.organ,
        //         description: deepLinkResponseJson.obj.htmlcontent,
        //     };
        // };

        // 使用cache
        const itemsStillOpen = await Promise.all(
            responseJson
                .filter((i) => Number.parseInt(i.infostate) === 1)
                .map((entry) =>
                    cache.tryGet(entry.docid.toString(), async () => {
                        const deepLink = `https://rczp.china-railway.com.cn/page/platform/company_dynamic_del.html?parentId=${entry.parentId}&jmetazpdtid=${entry.docid}`;
                        const newPage = await browser.newPage();
                        logger.info(`Goto: ${deepLink}`);
                        await newPage.goto(deepLink, { waitUntil: 'domcontentloaded' });

                        const deepLinkResponse = await newPage.waitForResponse((res) => {
                            logger.info(res.url());

                            if (res.url().includes('getInfoZpdt')) {
                                logger.info(`Get ====> ${res.url()}`);
                            }
                            return res.url().includes('getInfoZpdt');
                        });
                        const deepLinkResponseJson: CompanyInfoDataWrapper = await deepLinkResponse.json();
                        await newPage.close();

                        return {
                            title: entry.doctitle,
                            link: deepLink,
                            pubDate: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
                            updated: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
                            author: entry.organ,
                            description: deepLinkResponseJson.obj.htmlcontent,
                        };
                    })
                )
        );

        // 将Promise转为同步操作
        // const itemsStillOpenPromises = responseJson.filter((i) => Number.parseInt(i.infostate) === 1).map((element) => fetchDetailInfo(element));

        // const itemsStillOpen = await Promise.all(itemsStillOpenPromises);

        // merge `itemsStillOpen` and `itemsClosed` together

        const items = [...itemsStillOpen, ...itemsClosed];

        logger.info(JSON.stringify(responseJson));
        ctx.set('json', response);

        // logger.info(await infoContent.text());
        browser.close();

        return {
            title: '中国铁路人才招聘网|招聘动态',
            item: items,
        };
    },
};
