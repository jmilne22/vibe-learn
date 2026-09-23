package exercise

import (
	"encoding/json"
	"fmt"
	"io"
	"net/url"
)

type Config struct {
	Targets []string `json:"targets"`
	Workers int      `json:"workers"`
}

func ReadConfig(r io.Reader) (Config, error) {
	var c Config
	d := json.NewDecoder(r)
	d.DisallowUnknownFields()
	if err := d.Decode(&c); err != nil {
		return Config{}, fmt.Errorf("decode config: %w", err)
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return Config{}, fmt.Errorf("expected one JSON object")
	}
	if len(c.Targets) == 0 || c.Workers < 1 || c.Workers > 16 {
		return Config{}, fmt.Errorf("need targets and workers in 1..16")
	}
	for _, target := range c.Targets {
		u, err := url.Parse(target)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil {
			return Config{}, fmt.Errorf("invalid target %q", target)
		}
	}
	return c, nil
}
