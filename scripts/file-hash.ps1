function Get-TaskFileHash([string]$LiteralPath) {
  $stream = [IO.File]::OpenRead($LiteralPath)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $algorithm.Dispose(); $stream.Dispose() }
}
