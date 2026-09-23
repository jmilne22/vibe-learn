package exercise

func UniqueTargets(names []string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0, len(names))
	for _, name := range names {
		if !seen[name] {
			seen[name] = true
			result = append(result, name)
		}
	}
	return result
}
