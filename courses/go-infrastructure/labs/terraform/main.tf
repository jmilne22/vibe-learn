terraform {
  required_version = "= 1.14.7"
  required_providers {
    local = {
      source  = "hashicorp/local"
      version = "= 2.7.0"
    }
  }
}

variable "service_name" {
  type    = string
  default = "endpoint-lab"
}

resource "local_file" "config" {
  filename        = "${path.module}/generated-config.json"
  content         = jsonencode({ service = var.service_name, port = 8080 })
  file_permission = "0600"
}

output "config_path" {
  value = local_file.config.filename
}
