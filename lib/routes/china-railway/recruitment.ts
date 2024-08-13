import { DataItem, Route } from '@/types';
import logger from '@/utils/logger';
import puppeteer from '@/utils/puppeteer';
import dayjs from 'dayjs';

// obj.records[]
export interface RecruitmentData {
    docid: number; // 招聘公告ID，查看详细信息需要
    parentId: number; // 未知，查看详细信息需要
    docpubtime: number; // 招聘信息发布时间
    doctitle: string; // 招聘信息标题
    gwcounts: string; // 招聘岗位个数
    gwsums: string; // 招聘人数（总数）
    infostate: string; // 目前取值1和2, 2 = 已结束无法查看，1 = 正在进行可以查看
    invalidtime: string; // 招聘结束时间
    opertime: number; // 招聘公告操作（编辑）时间
    organ: string; // 招聘单位
}

export interface RecruitmentDataRecord {
    records: RecruitmentData[];
    total: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface RecruitmentDataWrapper {
    msg: string;
    obj: RecruitmentDataRecord;
    status: string;
    success: boolean;
}

interface CompanyInfoData {
    content: string; // 招聘信息详细内容，无html标签
    htmlcontent: string; // 招聘信息详细内容，有html标签
}

export interface CompanyInfoDataWrapper {
    msg: string;
    obj: CompanyInfoData;
    status: string;
    success: boolean;
}

export const route: Route = {
    path: '/recruitment',
    example: '/china-railway/recruitment',
    url: 'rczp.china-railway.com.cn',
    categories: ['government'],
    name: '招聘信息',
    maintainers: ['anonymous'],
    handler: async (ctx) => {
        const baseUrl = 'https://rczp.china-railway.com.cn/'; // page/recruitment/rec_info.html

        const link = `${baseUrl}page/recruitment/rec_info.html`;

        const browser = await puppeteer();

        const page = await browser.newPage();

        // intercept requests
        // await page.setRequestInterception(true);

        // page.on('requestfinished', (request) => {
        //     request.resourceType() === 'document' ? request.continue() : request.abort();
        // });

        logger.http(`Requesting ${link}`);

        await page.goto(link, {
            waitUntil: 'domcontentloaded',
        });

        logger.info(page.url());
        const response = await page.waitForResponse((res) => {
            logger.info(res.url());

            if (res.url().includes('pageList')) {
                logger.info(`Get ====> ${res.url()}`);
            }
            return res.url().includes('pageList');
        });
        const responseJson: RecruitmentData[] = (await response.json()).obj.records;

        // 已经关闭的招聘公告
        const itemsClosed: DataItem[] = responseJson
            .filter((i) => Number.parseInt(i.infostate) === 2)
            .map((entry) => ({
                title: entry.doctitle,
                link: `https://rczp.china-railway.com.cn/page/platform/company_info_del.html?parentId=${entry.parentId}&jmetazpxxid=${entry.docid}`,
                author: entry.organ,
                pubDate: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
                updated: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
                description: `该招聘的时间为 ${dayjs(entry.docpubtime).format('MM/DD/YYYY')} 至 ${dayjs(entry.invalidtime).format('MM/DD/YYYY')}，目前已结束，无法查看详细公告内容。`,
            }));

        // 正在招聘的公告
        const fetchDetailInfo = async (entry: RecruitmentData): Promise<DataItem> => {
            const deepLink = `https://rczp.china-railway.com.cn/page/platform/company_info_del.html?parentId=${entry.parentId}&jmetazpxxid=${entry.docid}`;
            // const newPage = await browser.newPage();
            await page.goto(deepLink, { waitUntil: 'domcontentloaded' });

            const deepLinkResponse = await page.waitForResponse((res) => res.url().includes('getinfo'));
            const deepLinkResponseJson: CompanyInfoDataWrapper = await deepLinkResponse.json();
            // await newPage.close();

            return {
                title: entry.doctitle,
                link: deepLink,
                pubDate: dayjs(entry.docpubtime).format('MM/DD/YYYY'),
                updated: dayjs(entry.opertime).format('MM/DD/YYYY'),
                author: entry.organ,
                description: deepLinkResponseJson.obj.htmlcontent,
            };
        };

        // 将Promise转为同步操作
        const itemsStillOpenPromises = responseJson.filter((i) => Number.parseInt(i.infostate) === 1).map((element) => fetchDetailInfo(element));

        const itemsStillOpen = await Promise.all(itemsStillOpenPromises);

        // merge `itemsStillOpen` and `itemsClosed` together

        const items = [...itemsStillOpen, ...itemsClosed];

        logger.info(JSON.stringify(responseJson));
        ctx.set('json', response);

        // logger.info(await infoContent.text());
        browser.close();

        return {
            title: '中国铁路人才招聘网|招聘信息',
            item: items,
        };
    },
};
