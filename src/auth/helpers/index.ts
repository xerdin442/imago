import * as cheerio from 'cheerio';

export function generateCallbackHtml(
  identifier: string,
  redirectUrl: string,
  nonce: string,
): string {
  // Use Cheerio to create a simple HTML structure
  const $ = cheerio.load(
    '<!DOCTYPE html><html><head><title>Success</title></head><body></body></html>',
  );

  const mainContent = `
    <div class="container">
      <h1 class="text-2xl font-bold mb-4">Authentication Successful!</h1>
      <button id="return-button">Return to Wager App</button>
    </div>`;
  $('body').append(mainContent);

  // Add the script tag to redirect to the homepage
  const scriptContent = `
    const returnButton = document.getElementById("return-button");    
    returnButton.addEventListener("click", () => {
      window.location.href = "${redirectUrl}?googleAuth=${identifier}";
    });
  `;

  // Create a script element and append to the body
  const scriptElement = $('<script>')
    .html(scriptContent)
    .attr('nonce', `${nonce}`);
  $('body').append(scriptElement);

  return $.html();
}
