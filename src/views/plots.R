# Plots
library(ggplot2)

warmup_plot <- function (data_b, group, colors) {
  group_col <- enquo(group)
  
  ## First take the medians over the values for each commitid separately
  medians <- data_b %>%
    group_by(!!group_col) %>%
    summarise(median = median(value),
    .groups = "drop")

  # use the highest one with a little margin as an upper bound
  upper_bound <- 2 * max(medians$median)

  plot <- ggplot(data_b, aes(x=iteration, y=value)) +
    geom_line(aes(colour = !!group_col)) +
    scale_color_manual(values = colors) +
    # ggtitle(paste(b, s, e)) +
    ylab(levels(data_b$unit)) +
    # scale_x_continuous(breaks = seq(0, max(data_b$iteration), 10)) +
    coord_cartesian(ylim=c(0, upper_bound)) +
    geom_vline(
      xintercept = seq(0, max(data_b$iteration), 50),
      linetype = "longdash", colour = "#cccccc") +
    theme_simple(8) +
    theme(legend.position=c(0.85, .92))
  plot
}

negative_geometric.mean <- function(d) {
  # just shift values temporarily away from 0,
  # transformation doesn't change results when using a sufficiently large constant
  # normally, one would use simply 1, but in this case, it may change the results
  # fixed_geomean should really only be used in the context of stat_summary
  m <- geometric.mean(d + 10000000)
  m - 10000000
}

compare_runtime_ratio_of_suites_plot <- function (
    data, slower_runtime_ratio, faster_runtime_ratio, fast_color, slow_color, scale_color) {
  p <- ggplot(data, aes(ratio, suite, fill=slower)) +
    geom_vline(aes(xintercept=1), colour="#999999", linetype="solid") +
    geom_vline(aes(xintercept=slower_runtime_ratio), colour="#cccccc", linetype="dashed") +
    geom_vline(aes(xintercept=faster_runtime_ratio), colour="#cccccc", linetype="dashed") +
    geom_boxplot(aes(colour = commitid),
                  outlier.size = 0.9,
                  outlier.alpha = 0.6) +
    stat_summary(fun = negative_geometric.mean,
                  size = 1, colour = "#503000", geom = "point") +
    scale_x_log10() +
    ylab("")
  
  if (min(data$ratio) > 0.5 & max(data$ratio) < 2.5) {
    p <- p + coord_cartesian(xlim=c(0.5, 2.5))
  }
  
  p <- p + theme_simple(8) +
    scale_color_manual(values = scale_color) +
    scale_fill_manual(breaks=c("slower", "faster", "indeterminate"),
                      values=c(slow_color, fast_color, NA)) +
    theme(legend.position = "none")
  p
}

small_inline_comparison <- function (data, group, colors, colors_light) {
  group_col <- enquo(group)
  # small_inline_comparison(data_b)
  # data <- data_b
  p <- ggplot(data, aes(x = ratio_median, y = !!group_col, fill = !!group_col)) +
        geom_vline(aes(xintercept=1), colour="#333333", linetype="solid") +
        geom_boxplot(aes(colour = !!group_col),
                          outlier.size = 0.9,
                          outlier.alpha = 0.6,
                          lwd=0.2) +
        geom_jitter(aes(colour = !!group_col, y = !!group_col), size=0.3, alpha=0.3) +
        scale_x_log10()
  
  if (min(data$ratio_median) > 0.5 & max(data$ratio_median) < 5) {
    p <- p + coord_cartesian(xlim=c(0.5, 5))
  }
  
  p <- p + theme_simple(5) +
        ylab("") +
        scale_y_discrete(limits = rev) +
        scale_color_manual(values = colors) +
        scale_fill_manual(values = colors_light) +
        theme(legend.position = "none",
              axis.ticks.y=element_blank(),
              axis.text.y=element_blank(),
              axis.ticks.length.x = unit(-.05, "cm"),
              axis.text.x = element_text(margin = margin(t = 0.1, unit = "cm")),
              axis.line.y.left=element_blank(),
              axis.line.x.bottom=element_blank())
  p
}

##
## Theme Settings
##
theme_simple <- function(font_size = 8) {
  theme_bw() +
    theme(axis.text.x          = element_text(size = font_size, lineheight=0.7, family="Arial"),
          axis.title.x         = element_blank(),
          axis.title.y         = element_text(size = font_size, family="Arial"),
          axis.text.y          = element_text(size = font_size, family="Arial"),
          axis.line            = element_line(colour = "gray"),
          plot.title           = element_text(size = font_size, family="Arial"),
          legend.text          = element_text(size = font_size, family="Arial"),
          legend.title         = element_blank(),
          legend.background    = element_blank(),
          panel.background     = element_blank(), #element_rect(fill = NA, colour = NA),
          panel.grid.major     = element_blank(),
          panel.grid.minor     = element_blank(),
          panel.border         = element_blank(),
          plot.background      = element_blank(), #element_rect(fill = NA, colour = NA)
          strip.background     = element_blank(),
          strip.text           = element_text(size = font_size, family="Arial"),
          plot.margin = unit(c(0,0,0,0), "cm"))
}

element90 <- function() { element_text(angle = 90, hjust = 1, vjust=0.5) }
