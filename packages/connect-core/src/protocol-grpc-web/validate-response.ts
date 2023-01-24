// Copyright 2021-2023 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { codeFromHttpStatus } from "../protocol-grpc/http-status.js";
import { headerEncoding } from "../protocol-grpc/headers.js";
import { findTrailerError } from "../protocol-grpc/trailer-status.js";
import type { Compression } from "../compression.js";
import { ConnectError } from "../connect-error.js";
import { Code } from "../code.js";
import { parseContentType } from "./content-type.js";

/**
 * Validates response status and header for the gRPC-web protocol.
 * Throws a ConnectError if the header contains an error status,
 * the HTTP status indicates an error, or if the content type is
 * unexpected.
 */
export function validateResponse(
  useBinaryFormat: boolean,
  status: number,
  headers: Headers
): void {
  const code = codeFromHttpStatus(status);
  if (code != null) {
    throw new ConnectError(
      decodeURIComponent(headers.get("grpc-message") ?? `HTTP ${status}`),
      code
    );
  }
  const mimeType = headers.get("Content-Type");
  const parsedType = parseContentType(mimeType);
  if (!parsedType || parsedType.binary != useBinaryFormat) {
    throw new ConnectError(
      `unexpected response content type ${mimeType ?? "?"}`,
      Code.Internal
    );
  }
  if (parsedType.text) {
    throw new ConnectError(
      "grpc-web-text is not supported",
      Code.InvalidArgument
    );
  }
  const err = findTrailerError(headers);
  if (err) {
    throw err;
  }
}

/**
 * Validates response status and header for the gRPC-web protocol.
 * This function is identical to validateResponse(), but also verifies
 * that a given encoding header is acceptable.
 */
export function validateResponseWithCompression(
  useBinaryFormat: boolean,
  acceptCompression: Compression[],
  status: number,
  headers: Headers
): { compression: Compression | undefined } {
  validateResponse(useBinaryFormat, status, headers);

  let compression: Compression | undefined;
  const encoding = headers.get(headerEncoding);
  if (encoding !== null && encoding.toLowerCase() !== "identity") {
    compression = acceptCompression.find((c) => c.name === encoding);
    if (!compression) {
      throw new ConnectError(
        `unsupported response encoding "${encoding}"`,
        Code.InvalidArgument
      );
    }
  }
  return {
    compression,
  };
}