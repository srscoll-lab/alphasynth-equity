import assert from 'node:assert/strict';
import {fcsEvidenceFailureMessage as message} from '../src/fcs-evidence-failure.ts';
assert.match(message(0,[{outcome:'official_document_retrieval_summary',retrieved_document_count:0}]),/could not retrieve/);
assert.match(message(0,[{outcome:'model_returned_no_verified_factor_comparison'}]),/could not extract/);
assert.match(message(2,[{outcome:'empty_pdf_text'}]),/2 of 4.*require further document extraction/);
assert.match(message(3,[{outcome:'publication_date_not_supported_by_document_header'}]),/dates/);
assert.match(message(0,[]),/Review finished.*No FCS report was generated/);
assert.doesNotMatch(message(0,[{outcome:'http_error',detail:'private token'}]),/private token/);
console.log('FCS terminal explanations: retrieval, extraction, dates, partial factors and private diagnostic redaction passed.');
