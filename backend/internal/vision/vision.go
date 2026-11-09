// Package vision asks Claude to read photos of a real building and suggest the editor's settings
// for it. The editor describes its settings (Guide) and the answer's shape (Schema, a JSON schema);
// this package only adds the photos and the task, and returns Claude's JSON answer as is.
package vision

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
)

// Model reads the photos. Opus is the best at judging sizes and details from pictures.
const Model = "claude-opus-5-5"

// Photo is one photo of the building: its MIME type (image/jpeg, image/png or image/webp) and bytes.
type Photo struct {
	Type string
	Data []byte
}

// Request is what to suggest settings from.
type Request struct {
	Kind   string          // kind of building, e.g. "cow"
	Guide  string          // the editor's description of its settings for this kind
	Notes  string          // what the admin knows about the building ("about 30 m long ...")
	Schema json.RawMessage // JSON schema of the answer
	Photos []Photo
}

// Suggester suggests settings from photos. The API holds one; tests use a fake.
type Suggester interface {
	Suggest(ctx context.Context, req Request) (json.RawMessage, error)
}

// Error is a failure worth showing to the admin as is (Claude declined, the answer was cut off ...).
type Error string

func (e Error) Error() string { return string(e) }

// Claude is the Suggester that calls the Claude API.
type Claude struct {
	client anthropic.Client
}

// New makes a Suggester with an Anthropic API key.
func New(apiKey string) *Claude {
	return &Claude{client: anthropic.NewClient(option.WithAPIKey(apiKey), option.WithMaxRetries(2))}
}

const system = `You help an admin turn photos of a real farm building into a starting design in "House to i3d", ` +
	`a web app that builds Farming Simulator 25 buildings from settings. Look carefully at every photo, ` +
	`work out the building's shape, proportions, roof, cladding, colours, and where its windows and doors are, ` +
	`and answer with settings for the app that make the closest match it can build.

Judge sizes from things of known size: a door is about 2 m tall, a person about 1.8 m, a window about 1 m, ` +
	`a wall board about 15-20 cm wide, a car about 4.5 m long. Use the admin's notes over your own estimates. ` +
	`Colours are hex codes of the paint as it would look new and in daylight, not in shadow.

The app can't build everything a real building has. Pick the nearest option it has, and say in "notes" ` +
	`what doesn't match, and what you weren't sure of, so the admin knows what to check. If a wall can't be seen ` +
	`in any photo, give it what such buildings usually have and say so.`

// Suggest sends the photos and returns Claude's answer, a JSON object matching req.Schema.
func (c *Claude) Suggest(ctx context.Context, req Request) (json.RawMessage, error) {
	var schema map[string]any
	if err := json.Unmarshal(req.Schema, &schema); err != nil {
		return nil, fmt.Errorf("schema: %w", err)
	}
	content := []anthropic.BetaContentBlockParamUnion{}
	for i, p := range req.Photos {
		content = append(content,
			anthropic.NewBetaTextBlock(fmt.Sprintf("Photo %d:", i+1)),
			anthropic.NewBetaImageBlock(anthropic.BetaBase64ImageSourceParam{
				Data:      base64.StdEncoding.EncodeToString(p.Data),
				MediaType: anthropic.BetaBase64ImageSourceMediaType(p.Type),
			}))
	}
	text := "Kind of building: " + req.Kind + "\n\n<settings_guide>\n" + req.Guide + "\n</settings_guide>"
	if n := strings.TrimSpace(req.Notes); n != "" {
		text += "\n\n<admin_notes>\n" + n + "\n</admin_notes>"
	}
	text += "\n\nSuggest the settings for the building in the photos."
	content = append(content, anthropic.NewBetaTextBlock(text))

	msg, err := c.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     Model,
		MaxTokens: 16000,
		System:    []anthropic.BetaTextBlockParam{{Text: system}},
		Messages:  []anthropic.BetaMessageParam{anthropic.NewBetaUserMessage(content...)},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Effort: anthropic.BetaOutputConfigEffortHigh,
			Format: anthropic.BetaJSONOutputFormatParam{Schema: schema},
		},
		// If a safety check declines the request, the API retries it on another model by itself.
		Fallbacks: anthropic.BetaFallbacksParamUnion{OfDefault: "default"},
		Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
	})
	if err != nil {
		var apiErr *anthropic.Error
		if errors.As(err, &apiErr) {
			switch apiErr.StatusCode {
			case 401, 403:
				return nil, Error("The server's Anthropic API key doesn't work. Check ANTHROPIC_API_KEY.")
			case 429, 529:
				return nil, Error("Claude is busy right now. Try again in a minute.")
			case 400, 413:
				return nil, Error("Claude couldn't take these photos: " + apiErr.Error())
			}
		}
		return nil, err
	}
	switch msg.StopReason {
	case anthropic.BetaStopReasonRefusal:
		return nil, Error("Claude declined to read these photos. Try other photos.")
	case anthropic.BetaStopReasonMaxTokens:
		return nil, Error("Claude's answer was cut off. Try again, or with fewer photos.")
	}
	for _, b := range msg.Content {
		if b.Type == "text" && json.Valid([]byte(b.Text)) {
			return json.RawMessage(b.Text), nil
		}
	}
	return nil, Error("Claude's answer wasn't the settings. Try again.")
}
