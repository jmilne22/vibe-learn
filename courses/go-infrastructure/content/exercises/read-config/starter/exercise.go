package exercise

import "io"

type Config struct {
	Targets []string `json:"targets"`
	Workers int      `json:"workers"`
}

func ReadConfig(r io.Reader) (Config, error) { return Config{}, nil }
