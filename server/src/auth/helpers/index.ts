import * as cheerio from 'cheerio';

export function generateCallbackHtml(
  identifier: string,
  redirectUrl: string,
  nonce: string,
): string {
  const $ = cheerio.load(
    '<!DOCTYPE html><html><head></head><body></body></html>',
  );

  const headContent = `
    <title>Authentication Successful</title>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
    />
    <link
      rel="shortcut icon"
      href="https://res.cloudinary.com/ddloc28y9/image/upload/v1756179790/imago-logo_s4lurp.png"
      type="image/x-icon"
    />
    <style>
      body {
        font-family:
          -apple-system, BlinkMacsSystemFont, 'Segoe UI', Roboto, Helvetica,
          Arial, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        margin: 0;
        background-color: #f3f4f5;
        color: #333;
        text-align: center;
        padding: 0 20px;
      }
      .container {
        padding: 40px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        max-width: 350px;
        width: 100%;
      }
      h1 {
        font-size: 1.6rem;
        font-weight: 700;
        margin-bottom: 1.5rem;
        color: #1a202c;
      }
      .icon-container {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 112px;
        height: 112px;
        border-radius: 50%;
        background-color: #b9fbc0;
        margin: 0 auto 20px;
      }
      .icon-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 96px;
        height: 96px;
        border-radius: 50%;
        background-color: #55c57a;
      }
      .material-symbols-outlined {
        font-size: 60px;
        color: #ffffff;
      }
      .logo {
        width: 24px;
        height: 24px;
        margin-right: 8px;
        fill: #fff;
      }
      #return-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 12px 24px;
        border-radius: 8px;
        border: none;
        background-color: #000000;
        color: #ffffff;
        font-size: 1.15rem;
        font-weight: 600;
        cursor: pointer;
        transition: background-color 0.3s ease;
      }
      #return-button:hover {
        background-color: #333333;
      }
      @media (max-width: 600px) {
        .container {
          max-width: 90%;
        }
        h1 {
          font-size: 1.4rem;
        }
      }
    </style>
  `;
  $('head').append(headContent);

  const mainContent = `
    <div class="container">
      <div class="icon-container">
        <div class="icon-inner">
          <span class="material-symbols-outlined"> check </span>
        </div>
      </div>
      <h1>Authentication Successful!</h1>
      <button id="return-button">
        <span
          class="material-symbols-outlined"
          style="font-size: 25px; margin-right: 6px"
        >
          spa
        </span>
        <span>Return to Imago</span>
      </button>
    </div>
  `;
  $('body').append(mainContent);

  // Add the script tag to redirect to the homepage
  const scriptContent = `
    const returnButton = document.getElementById("return-button");    
    returnButton.addEventListener("click", () => {
      window.location.href = "${redirectUrl}?socialAuth=${identifier}";
    });
  `;

  // Create a script element and append to the body
  const scriptElement = $('<script>')
    .html(scriptContent)
    .attr('nonce', `${nonce}`);
  $('body').append(scriptElement);

  return $.html();
}
