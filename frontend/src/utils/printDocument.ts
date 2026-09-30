import { salesService } from '../services/sales.service';
import { PaperSize } from '../services/settings.service';

// Shared hidden-iframe print helper - previously copy-pasted with minor
// drift across POSTab.tsx, POSOrders.tsx, Sales.tsx and SaleCreate.tsx.
// Prints without opening a new tab/window; the `printed` guard prevents a
// double print if the iframe's onload somehow fires more than once.
export const printHtmlInIframe = (html: string) => {
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  document.body.appendChild(printFrame);

  const frameWindow = printFrame.contentWindow;
  if (!frameWindow) {
    document.body.removeChild(printFrame);
    return false;
  }

  frameWindow.document.open();
  frameWindow.document.write(html);
  frameWindow.document.close();

  let printed = false;
  const cleanup = () => {
    setTimeout(() => {
      if (document.body.contains(printFrame)) document.body.removeChild(printFrame);
    }, 300);
  };

  printFrame.onload = () => {
    if (printed) return;
    printed = true;
    frameWindow.focus();
    frameWindow.print();
    cleanup();
  };

  return true;
};

// Document Print Settings: fetches the sale/quotation's print HTML - with an
// optional paperSize override for this one print (A4/A5/80mm/58mm Thermal) -
// and prints it. Omitting paperSize falls back to the saved default
// (Settings -> Print Settings), resolved server-side.
export const printSaleDocument = async (
  saleId: number,
  opts?: { paperSize?: PaperSize; onError?: (message: string) => void }
): Promise<boolean> => {
  try {
    const printRes = await salesService.getPrintHtml(saleId, opts?.paperSize);
    if (!printRes.success || !printRes.data?.html) {
      opts?.onError?.(printRes.error || 'Unable to load print template');
      return false;
    }
    const opened = printHtmlInIframe(printRes.data.html);
    if (!opened) {
      opts?.onError?.('Unable to open print frame');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Print document error:', error);
    opts?.onError?.('Unable to generate document');
    return false;
  }
};
