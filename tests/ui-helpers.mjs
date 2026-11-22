export async function backToList(page){
 if(await page.locator('#details').isVisible())await page.locator('#close-details').click();
}
export async function connectGoogle(page){
 await page.locator('#service').click();await page.locator('#choose-google').click();
}
