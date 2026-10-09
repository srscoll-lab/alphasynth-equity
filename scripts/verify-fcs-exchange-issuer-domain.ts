import assert from "node:assert/strict";
import { exchangeIssuerDomainHints, regulatorIssuerDomainHints, type ExchangeIssuerDomainInput } from "../src/fcs-exchange-issuer-domain.ts";

const fixture: ExchangeIssuerDomainInput = {
  documentUrl: "https://nsearchives.nseindia.com/corporate/quarterly-results.pdf",
  companyName: "Acme Aviation Limited",
  ticker: "ACME",
  documentText: "ACME AVIATION LIMITED\nNSE Symbol: ACME\nWebsite: https://www.acmeaviation.com\nQuarterly results",
};
const hints = (changes: Partial<ExchangeIssuerDomainInput> = {}) => exchangeIssuerDomainHints({ ...fixture, ...changes });
assert.deepEqual(hints(), ["acmeaviation.com"]);
assert.deepEqual(hints({ documentUrl: "https://www.bseindia.com/xml-data/results.pdf", documentText: fixture.documentText.replace("https://www.", "www.") }), ["acmeaviation.com"]);
for (const documentUrl of ["https://nsearchives.nseindia.com.evil.com/results.pdf", "https://news.acmeaviation.com/results.pdf", "http://www.bseindia.com/results.pdf", "https://www.bseindia.com/results.html"]) {
  assert.deepEqual(hints({ documentUrl }), [], documentUrl);
}
for (const documentText of [
  fixture.documentText.replace("NSE Symbol: ACME", "NSE Symbol: OTHER\nACME"),
  fixture.documentText.replace("NSE Symbol: ACME", "NSE Symbol: ACMEPLUS"),
  fixture.documentText.replace("NSE Symbol: ACME", "Ticker mentioned: ACME"),
  fixture.documentText.replace("ACME AVIATION LIMITED", "NOTACME AVIATION LIMITED"),
  fixture.documentText.replace("Website:", "Arbitrary link:"),
  "x".repeat(4000) + fixture.documentText,
  fixture.documentText + "\nNSE Symbol: OTHER",
  fixture.documentText + "\nWebsite: https://www.otherissuer.com",
]) assert.deepEqual(hints({ documentText }), []);
for (const website of ["https://google.com", "https://issuer.wordpress.com", "https://gmail.com", "https://www.linkedin.com", "https://127.0.0.1", "https://issuer.local", "https://acmeaviation.com@evil.com", "https://acmeaviation.com:8443", "https://acmeaviation.com/path", "https://acmeaviation.com?redirect=evil", "http://www.acmeaviation.com"]) {
  assert.deepEqual(hints({ documentText: fixture.documentText.replace("https://www.acmeaviation.com", website) }), [], website);
}
console.log("Exchange issuer domain hints: mocked positive and fail-closed fixtures passed.");
const regulator = {...fixture,documentUrl:'https://www.sebi.gov.in/sebi_data/attachdocs/123.pdf',documentText:'RED HERRING PROSPECTUS\nACME AVIATION LIMITED\nWebsite: www.acmeaviation.com;\nCorporate Identity Number: U12345DL2004PLC123456'};
assert.deepEqual(regulatorIssuerDomainHints(regulator),['acmeaviation.com']);
for (const change of [
 {documentUrl:'https://www.sebi.gov.in.evil.com/sebi_data/attachdocs/123.pdf'},
 {documentText:regulator.documentText.replace('ACME AVIATION LIMITED','OTHER LIMITED')},
 {documentText:regulator.documentText.replace('U12345DL2004PLC123456','missing')},
 {documentText:regulator.documentText+'\nWebsite: www.other.com'},
 {documentText:regulator.documentText.replace('www.acmeaviation.com','www.linkedin.com')},
]) assert.deepEqual(regulatorIssuerDomainHints({...regulator,...change}),[]);
console.log('SEBI prospectus identity-only fallback: exact legal heading, CIN and unique safe website tests passed.');
