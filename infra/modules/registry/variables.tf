variable "name" {
  description = "Prefix of every repository."
  type        = string
}

variable "repositories" {
  description = "One repository per image."
  type        = set(string)
}

variable "keep_images" {
  description = "Images kept per repository; older ones expire."
  type        = number
  default     = 10
}
