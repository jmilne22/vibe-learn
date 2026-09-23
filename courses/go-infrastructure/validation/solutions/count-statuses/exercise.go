package exercise

func CountStatuses(codes []int) map[string]int {
	result := map[string]int{"ok": 0, "client": 0, "server": 0, "other": 0}
	for _, code := range codes {
		switch {
		case code >= 200 && code < 300:
			result["ok"]++
		case code >= 400 && code < 500:
			result["client"]++
		case code >= 500 && code < 600:
			result["server"]++
		default:
			result["other"]++
		}
	}
	return result
}
