import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

export function generateCallbackHtml(
  identifier: string,
  redirectUrl: string,
  nonce: string,
): string {
  const htmlFilePath = path.resolve(__dirname, 'callback.html');
  const htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');

  const $ = cheerio.load(htmlContent);

  // Add the script tag to redirect
  const scriptContent = `
    const returnButton = document.getElementById("return-button");
    returnButton.addEventListener("click", () => {
      window.location.href = "${redirectUrl}?socialAuth=${identifier}";
    });
  `;

  // Create and append the script element with the nonce
  const scriptElement = $('<script>')
    .html(scriptContent)
    .attr('nonce', `${nonce}`);
  $('body').append(scriptElement);

  return $.html();
}
